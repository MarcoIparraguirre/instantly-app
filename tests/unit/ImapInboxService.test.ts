import { describe, it, expect } from 'vitest';
import {
  cleanBodyText,
  decodeQuotedPrintableUtf8,
  decodeMimeWords
} from '@/core/services/ImapInboxService';

describe('ImapInboxService UTF-8 & MIME Decoding', () => {
  it('properly decodes UTF-8 Quoted-Printable Spanish accents and inverted question marks without mojibake', () => {
    const rawImapBody = `> {2006}\r\n--000000000000abc\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nMuchas gracias por su info\r\n\r\nEl mi=C3=A9, 4 de nov de 2026, 14:21, Marco Vectra escribi=C3=B3:\r\n> Hola, estuve navegando en autocentroalarmas.com.ar y not=C3=A9 que los=\r\n usuarios no disponen de un configurador.\r\n> =C2=BFTiene sentido armar una breve demo mostrando c=C3=B3mo funcionar=\r\n=C3=ADa?\r\n--000000000000abc\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n<div>Muchas gracias por su info HTML DUPLICADO</div>`;

    const cleaned = cleanBodyText(rawImapBody);

    expect(cleaned).not.toContain('{2006}');
    expect(cleaned).not.toContain('HTML DUPLICADO');
    expect(cleaned).toContain('Muchas gracias por su info');
    expect(cleaned).toContain('El mié, 4 de nov de 2026, 14:21, Marco Vectra escribió:');
    expect(cleaned).toContain('noté que los usuarios');
    expect(cleaned).toContain('¿Tiene sentido armar una breve demo mostrando cómo funcionaría?');
  });

  it('cleans bounce notification messages removing {2048} and fixing Spanish accents', () => {
    const rawBounce = `> {2048}\r\n** No se encontr=C3=B3 la direcci=C3=B3n **\r\nEl mensaje se bloque=C3=B3.`;
    const cleaned = cleanBodyText(rawBounce);

    expect(cleaned).not.toContain('{2048}');
    expect(cleaned).toContain('** No se encontró la dirección **');
    expect(cleaned).toContain('El mensaje se bloqueó.');
  });

  it('decodes MIME Q-encoded and B-encoded headers in UTF-8', () => {
    const qHeader = '=?UTF-8?Q?Configuraci=C3=B3n_de_campa=C3=B1a?=';
    expect(decodeMimeWords(qHeader)).toBe('Configuración de campaña');

    const bHeader = `=?UTF-8?B?${Buffer.from('Cotización de mesadas', 'utf8').toString('base64')}?=`;
    expect(decodeMimeWords(bHeader)).toBe('Cotización de mesadas');
  });

  it('repairs already-corrupted Latin1 UTF-8 mojibake sequences if present', () => {
    const mojibake = 'No se encontrÃ³ la direcciÃ³n Â¿Tiene sentido cÃ³mo funcionarÃ­a?';
    expect(decodeQuotedPrintableUtf8(mojibake)).toBe(
      'No se encontró la dirección ¿Tiene sentido cómo funcionaría?'
    );
  });
});
