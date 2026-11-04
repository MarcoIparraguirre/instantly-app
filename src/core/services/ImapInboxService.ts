import tls from 'tls';
import { Lead, SenderAccount, EmailThread, Campaign } from '@/types';

export interface ImapSyncResult {
  threads: EmailThread[];
  bouncedEmails: { email: string; reason: string; timestamp: string }[];
  repliedEmails: string[];
  syncedAccounts: number;
  errors: string[];
}

export function fixLatin1Mojibake(str: string): string {
  if (!str) return '';
  if (!/[\u00c2\u00c3][\u0080-\u00bf]/.test(str)) return str;
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch {
    return str;
  }
}

export function decodeQuotedPrintableUtf8(str: string): string {
  if (!str) return '';
  // 1. Remove soft line breaks (= at end of line)
  const withoutSoftBreaks = str.replace(/=\r?\n/g, '');
  // 2. Decode contiguous =XX hex byte sequences as UTF-8
  const decoded = withoutSoftBreaks.replace(/((?:=[0-9A-Fa-f]{2})+)/g, (match) => {
    try {
      const hex = match.replace(/=/g, '');
      return Buffer.from(hex, 'hex').toString('utf8');
    } catch {
      return match;
    }
  });
  return fixLatin1Mojibake(decoded);
}

export function decodeMimeWords(str: string): string {
  if (!str) return '';
  const decoded = str.replace(
    /=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g,
    (_, _charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          return Buffer.from(text, 'base64').toString('utf8');
        } else if (encoding.toUpperCase() === 'Q') {
          const withSpaces = text.replace(/_/g, ' ');
          return decodeQuotedPrintableUtf8(withSpaces);
        }
      } catch {}
      return text;
    }
  );
  return fixLatin1Mojibake(decoded);
}

export function cleanBodyText(raw: string): string {
  if (!raw) return '';

  // 1. Strip IMAP literal prefix like "> {2006}" or "{2048}" if present at start
  let work = raw
    .replace(/^(?:BODY\[TEXT\](?:<\d+>)?\s*)?>?\s*\{\d+\}\r?\n?/i, '')
    .replace(/\)\s*$/, '');

  // 2. If multipart message contains text/plain, isolate ONLY the text/plain section
  // so we don't duplicate the text/html section at the bottom
  const plainStartMatch = work.match(/Content-Type:\s*text\/plain[^\r\n]*\r?\n/i);
  if (plainStartMatch && plainStartMatch.index !== undefined) {
    const afterContentType = work.slice(plainStartMatch.index);
    // Cut off at the next MIME boundary or text/html section
    const htmlOrBoundaryIdx = afterContentType.search(
      /\r?\n--[a-zA-Z0-9_'()+,-./:=?]+|\r?\nContent-Type:\s*text\/(html|related)/i
    );
    work =
      htmlOrBoundaryIdx !== -1
        ? afterContentType.slice(0, htmlOrBoundaryIdx)
        : afterContentType;

    // Check if this plain-text part is base64 encoded
    const isBase64 = /Content-Transfer-Encoding:\s*base64/i.test(work);
    // Strip MIME part headers (everything up to the first blank line)
    const blankLineIdx = work.search(/\r?\n\r?\n/);
    if (blankLineIdx !== -1) {
      work = work.slice(blankLineIdx).trim();
    }

    if (isBase64) {
      try {
        const b64Clean = work.replace(/[^A-Za-z0-9+/=]/g, '');
        work = Buffer.from(b64Clean, 'base64').toString('utf8');
      } catch {}
    }
  } else {
    // Strip any leftover MIME headers or boundaries
    work = work
      .replace(/^--[a-zA-Z0-9_'()+,-./:=?]+(--)?\r?\n?/gm, '')
      .replace(/^Content-[A-Za-z-]+:[^\r\n]*\r?\n?/gim, '')
      .replace(/^Mime-Version:[^\r\n]*\r?\n?/gim, '');
  }

  // 3. Decode Quoted-Printable UTF-8 & fix any Latin-1 mojibake
  let cleaned = decodeQuotedPrintableUtf8(work);

  // 4. Strip any remaining HTML tags & normalize whitespace while keeping readable line breaks
  cleaned = cleaned
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned.slice(0, 900);
}

export class ImapInboxService {
  private resolveImapHost(smtpHost: string): string {
    if (!smtpHost) return 'imap.gmail.com';
    if (smtpHost.includes('gmail')) return 'imap.gmail.com';
    if (smtpHost.includes('office365') || smtpHost.includes('outlook')) return 'outlook.office365.com';
    return smtpHost.replace(/^smtp\./i, 'imap.');
  }

  async syncAccountInbox(
    account: SenderAccount,
    leads: Lead[],
    campaigns: Campaign[]
  ): Promise<{
    threads: EmailThread[];
    bouncedEmails: { email: string; reason: string; timestamp: string }[];
    repliedEmails: string[];
  }> {
    const imapHost = this.resolveImapHost(account.smtpHost);
    const user = account.smtpUser || account.email;
    const pass = account.smtpPass;

    if (!user || !pass || pass === 'demo-pass' || imapHost.includes('ethereal')) {
      return { threads: [], bouncedEmails: [], repliedEmails: [] };
    }

    const rawFetchOutput = await this.fetchRecentImapMessages(imapHost, user, pass, 35);
    return this.parseImapFetchResponse(rawFetchOutput, account, leads, campaigns);
  }

  private fetchRecentImapMessages(
    host: string,
    user: string,
    pass: string,
    limit: number = 35
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let step: 'greeting' | 'login' | 'select' | 'fetch' | 'done' = 'greeting';
      let existsCount = 0;

      const socket = tls.connect(
        {
          host,
          port: 993,
          servername: host,
          rejectUnauthorized: false
        },
        () => {}
      );
      socket.setEncoding('utf8');

      const timeout = setTimeout(() => {
        try {
          socket.destroy();
        } catch {}
        resolve(buffer);
      }, 9500);

      const finish = (result: string) => {
        clearTimeout(timeout);
        try {
          socket.write('A4 LOGOUT\r\n');
          socket.end();
        } catch {}
        resolve(result);
      };

      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      socket.on('data', (chunk: string) => {
        buffer += chunk;

        if (step === 'greeting' && buffer.includes('* OK')) {
          step = 'login';
          buffer = '';
          const safePass = pass.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          socket.write(`A1 LOGIN "${user}" "${safePass}"\r\n`);
        } else if (step === 'login') {
          if (buffer.includes('A1 OK')) {
            step = 'select';
            buffer = '';
            socket.write('A2 SELECT INBOX\r\n');
          } else if (buffer.includes('A1 NO') || buffer.includes('A1 BAD')) {
            clearTimeout(timeout);
            socket.destroy();
            reject(new Error('Autenticación IMAP rechazada'));
          }
        } else if (step === 'select') {
          const existsMatch = buffer.match(/\*\s+(\d+)\s+EXISTS/);
          if (existsMatch) {
            existsCount = parseInt(existsMatch[1], 10);
          }
          if (buffer.includes('A2 OK')) {
            if (existsCount === 0) {
              step = 'done';
              finish('');
              return;
            }
            step = 'fetch';
            buffer = '';
            const startSeq = Math.max(1, existsCount - limit + 1);
            socket.write(
              `A3 FETCH ${startSeq}:${existsCount} (UID INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)] BODY.PEEK[TEXT]<0.2048>)\r\n`
            );
          } else if (buffer.includes('A2 NO') || buffer.includes('A2 BAD')) {
            step = 'done';
            finish('');
          }
        } else if (step === 'fetch') {
          if (buffer.includes('A3 OK') || buffer.includes('A3 NO') || buffer.includes('A3 BAD')) {
            step = 'done';
            finish(buffer);
          }
        }
      });
    });
  }

  private parseImapFetchResponse(
    raw: string,
    account: SenderAccount,
    leads: Lead[],
    campaigns: Campaign[]
  ): {
    threads: EmailThread[];
    bouncedEmails: { email: string; reason: string; timestamp: string }[];
    repliedEmails: string[];
  } {
    if (!raw) return { threads: [], bouncedEmails: [], repliedEmails: [] };

    const leadByEmail = new Map<string, Lead>();
    for (const l of leads) {
      if (l.email) {
        leadByEmail.set(l.email.toLowerCase().trim(), l);
      }
    }

    const campaignById = new Map<string, Campaign>();
    for (const c of campaigns) {
      campaignById.set(c.id, c);
    }

    const threads: EmailThread[] = [];
    const bouncedEmails: { email: string; reason: string; timestamp: string }[] = [];
    const repliedEmails: string[] = [];

    // Split by "* <seq> FETCH (" blocks
    const blocks = raw.split(/\*\s+\d+\s+FETCH\s+\(/i).slice(1);

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const uidMatch = block.match(/UID\s+(\d+)/i);
      const uid = uidMatch ? uidMatch[1] : `${Date.now()}-${i}`;

      const fromMatch = block.match(/^From:\s*(.+)$/im);
      const subjectMatch = block.match(/^Subject:\s*(.+)$/im);
      const dateMatch = block.match(/^Date:\s*(.+)$/im);

      const rawFrom = decodeMimeWords((fromMatch?.[1] || '').trim());
      const subject = decodeMimeWords((subjectMatch?.[1] || '(Sin asunto)').trim());
      const rawDate = (dateMatch?.[1] || '').trim();
      const parsedDate =
        rawDate && !isNaN(Date.parse(rawDate))
          ? new Date(rawDate).toISOString()
          : new Date().toISOString();

      const emailMatch = rawFrom.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const fromEmail = (emailMatch?.[1] || '').toLowerCase().trim();
      const fromName = rawFrom.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || fromEmail;

      // Extract body after BODY[TEXT]<0> {2048}
      const bodyHeaderMatch = block.match(/BODY\[TEXT\](?:<\d+>)?\s*(?:\{\d+\}\r?\n?)?/i);
      const rawBodyPart =
        bodyHeaderMatch && bodyHeaderMatch.index !== undefined
          ? block.slice(bodyHeaderMatch.index + bodyHeaderMatch[0].length)
          : block;
      const bodySnippet = cleanBodyText(rawBodyPart);

      // 1. Check if this message is a Bounce notification (Mailer-Daemon / Postmaster)
      const isBounceSender =
        fromEmail.includes('mailer-daemon') ||
        fromEmail.includes('postmaster') ||
        /delivery status notification|undelivered mail|failure notice|no se ha podido entregar|address not found/i.test(
          subject
        );

      if (isBounceSender) {
        // Find all email addresses mentioned in the bounce body/block
        const allMentionedEmails =
          block.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        let matchedLead: Lead | undefined;
        let bouncedTargetEmail = '';

        for (const candidate of allMentionedEmails) {
          const normCandidate = candidate.toLowerCase().trim();
          if (
            normCandidate === account.email.toLowerCase().trim() ||
            normCandidate.includes('mailer-daemon') ||
            normCandidate.includes('google.com') ||
            normCandidate.includes('googlemail.com')
          ) {
            continue;
          }
          if (leadByEmail.has(normCandidate)) {
            matchedLead = leadByEmail.get(normCandidate);
            bouncedTargetEmail = normCandidate;
            break;
          }
        }

        // Only surface bounces that belong to leads in our campaigns
        if (matchedLead && bouncedTargetEmail) {
          const reason =
            bodySnippet ||
            'El servidor de destino rechazó el correo o la casilla no existe (Delivery Status Notification).';

          bouncedEmails.push({
            email: bouncedTargetEmail,
            reason,
            timestamp: parsedDate
          });

          const campName = campaignById.get(matchedLead.campaignId)?.name || 'Campaña';
          const shortPreview = reason.replace(/\s+/g, ' ').slice(0, 140);

          threads.push({
            id: `bounce-${uid}`,
            leadId: matchedLead.id,
            senderAccountId: account.id,
            leadName: `⚠️ Rebote: ${bouncedTargetEmail}`,
            leadEmail: bouncedTargetEmail,
            companyName: matchedLead.companyName || campName,
            campaignId: matchedLead.campaignId,
            sentiment: 'wrong-person',
            unread: true,
            lastMessageSnippet: `No se pudo entregar a ${bouncedTargetEmail}: ${shortPreview}`,
            lastActivityAt: parsedDate,
            messages: [
              {
                id: `msg-bounce-${uid}`,
                sender: rawFrom || 'mailer-daemon@googlemail.com',
                recipient: account.email,
                subject: `⚠️ Rebote detectado: ${subject}`,
                body: `El correo enviado a ${bouncedTargetEmail} rebotó.\n\nDetalle del servidor:\n${reason}`,
                timestamp: parsedDate,
                isIncoming: true
              }
            ]
          });
        }
        continue;
      }

      // 2. Check if this message is a Reply from one of our Campaign Leads
      const matchedLead = leadByEmail.get(fromEmail);
      if (matchedLead) {
        repliedEmails.push(fromEmail);

        const lowerBody = (subject + ' ' + bodySnippet).toLowerCase();
        let sentiment: EmailThread['sentiment'] = 'interested';
        if (/out of office|fuera de la oficina|vacaciones|ausente/i.test(lowerBody)) {
          sentiment = 'out-of-office';
        } else if (/no me interesa|not interested|baja|unsubscribe|remover/i.test(lowerBody)) {
          sentiment = 'not-interested';
        } else if (
          /reunión|reunion|llamada|call|agenda|jueves|martes|lunes|miércoles|viernes|meet/i.test(
            lowerBody
          )
        ) {
          sentiment = 'meeting-booked';
        }

        const displayName =
          `${matchedLead.firstName || ''} ${matchedLead.lastName || ''}`.trim() ||
          fromName ||
          fromEmail;
        const shortSnippet = bodySnippet.replace(/\s+/g, ' ').slice(0, 150);

        threads.push({
          id: `reply-${uid}`,
          leadId: matchedLead.id,
          senderAccountId: account.id,
          leadName: displayName,
          leadEmail: fromEmail,
          companyName:
            matchedLead.companyName ||
            matchedLead.customVariables?.URL ||
            matchedLead.website ||
            'Prospecto de Campaña',
          campaignId: matchedLead.campaignId,
          sentiment,
          unread: true,
          lastMessageSnippet: shortSnippet || subject,
          lastActivityAt: parsedDate,
          messages: [
            {
              id: `msg-reply-${uid}`,
              sender: fromEmail,
              recipient: account.email,
              subject,
              body: bodySnippet || subject,
              timestamp: parsedDate,
              isIncoming: true
            }
          ]
        });
      }
    }

    // Sort newest first
    threads.sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    return { threads, bouncedEmails, repliedEmails };
  }
}
