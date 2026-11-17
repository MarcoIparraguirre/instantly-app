import { SenderAccount } from '@/types';
import { SpamDetectorService } from './SpamDetectorService';
import { DnsCheckerService } from './DnsCheckerService';

export interface PlacementTestReport {
  senderEmail: string;
  subject: string;
  timestamp: string;
  predictedInboxRate: number; // 0 to 100%
  predictedSpamRisk: 'low' | 'medium' | 'high';
  spamScore: number;
  spamIssues: string[];
  dnsHealth: number;
  recommendations: string[];
}

export class PlacementTestService {
  private spamDetector = new SpamDetectorService();
  private dnsChecker = new DnsCheckerService();

  async runPlacementTest(
    sender: SenderAccount,
    subject: string,
    body: string
  ): Promise<PlacementTestReport> {
    const domain = sender.email.split('@')[1] || '';
    const spamMatches = this.spamDetector.check(`${subject} ${body}`);
    const dnsResult = domain ? await this.dnsChecker.auditDomain(domain) : null;

    const dnsScore = dnsResult ? dnsResult.overallHealth : 70;
    const spamPenalty = Math.min(60, spamMatches.length * 15);

    const predictedInboxRate = Math.max(10, Math.min(100, Math.round((dnsScore * 0.6) + (100 - spamPenalty) * 0.4)));

    let risk: 'low' | 'medium' | 'high' = 'low';
    if (predictedInboxRate < 50) risk = 'high';
    else if (predictedInboxRate < 75) risk = 'medium';

    const spamIssues = spamMatches.map(m => m.word);
    const recommendations: string[] = [];
    if (spamIssues.length > 0) {
      recommendations.push(`Reduce palabras detonantes de spam encontradas: ${spamIssues.slice(0, 3).join(', ')}.`);
    }
    if (dnsResult && !dnsResult.dmarc.valid) {
      recommendations.push('Configura tu registro DMARC en DNS con política quarantine o reject.');
    }
    if (dnsResult && !dnsResult.spf.valid) {
      recommendations.push('Verifica que tu registro SPF incluya la IP/servidor de tu proveedor SMTP.');
    }
    if (body.includes('http://')) {
      recommendations.push('Reemplaza todos los enlaces no seguros (http://) por HTTPS.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Excelente configuración técnica. Tus correos tienen una probabilidad óptima de aterrizar en Inbox.');
    }

    return {
      senderEmail: sender.email,
      subject,
      timestamp: new Date().toISOString(),
      predictedInboxRate,
      predictedSpamRisk: risk,
      spamScore: spamMatches.length,
      spamIssues,
      dnsHealth: dnsScore,
      recommendations
    };
  }
}
