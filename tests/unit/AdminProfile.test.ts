import { describe, it, expect } from 'vitest';
import { calculateInitials } from '@/context/AdminProfileContext';

describe('Admin Profile & Initials Utility', () => {
  it('correctly calculates initials for multi-word names', () => {
    expect(calculateInitials('Marco Rojas')).toBe('MR');
    expect(calculateInitials('Alex Morgan')).toBe('AM');
    expect(calculateInitials('Santiago Morales Gomez')).toBe('SG');
  });

  it('correctly calculates initials for single names', () => {
    expect(calculateInitials('Marco')).toBe('MA');
    expect(calculateInitials('Admin')).toBe('AD');
  });

  it('handles empty or whitespace strings with a safe default', () => {
    expect(calculateInitials('')).toBe('AD');
    expect(calculateInitials('   ')).toBe('AD');
  });
});
