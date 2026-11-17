import { describe, it, expect, vi } from 'vitest';
import { UniboxClassifierService } from '@/core/services/UniboxClassifierService';
import { IDealRepository } from '@/core/interfaces/storage';

describe('UniboxClassifierService (Unit Tests)', () => {
  const mockDealRepo: IDealRepository = {
    getDeals: vi.fn().mockResolvedValue([]),
    getDealById: vi.fn().mockResolvedValue(undefined),
    saveDeal: vi.fn().mockResolvedValue(undefined),
    updateDeal: vi.fn().mockResolvedValue(undefined),
    deleteDeal: vi.fn().mockResolvedValue(undefined)
  };

  const service = new UniboxClassifierService(mockDealRepo);

  it('classifies Out of office responses correctly', () => {
    const res = service.classify('Re: Quick sync', 'I am currently out of office on vacation until next Monday.');
    expect(res.sentiment).toBe('out-of-office');
    expect(res.confidence).toBeGreaterThan(0.9);
  });

  it('classifies Not interested responses and requests to unsubscribe', () => {
    const res = service.classify('Re: Quick sync', 'Please unsubscribe me and remove me from your list. Not interested.');
    expect(res.sentiment).toBe('not-interested');
  });

  it('classifies Meeting booked responses', () => {
    const res = service.classify('Re: Quick sync', 'Just booked a time on your Calendly link for Thursday.');
    expect(res.sentiment).toBe('meeting-booked');
  });

  it('classifies Interested responses and auto-creates Deal in CRM', async () => {
    const res = await service.processIncomingReply(
      'Re: Demo question',
      'Me interesa mucho, ¿podríamos agendar una breve llamada para ver el precio?',
      {
        leadId: 'lead-test-1',
        leadName: 'Carlos Gómez',
        leadEmail: 'carlos@techcorp.io',
        companyName: 'TechCorp'
      }
    );

    expect(res.sentiment).toBe('interested');
    expect(res.autoCreatedDeal).toBeDefined();
    expect(res.autoCreatedDeal?.companyName).toBe('TechCorp');
    expect(mockDealRepo.saveDeal).toHaveBeenCalled();
  });
});
