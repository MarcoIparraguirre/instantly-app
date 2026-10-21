'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AdminProfile {
  name: string;
  email: string;
  company: string;
  role: string;
  initials: string;
}

const defaultAdminProfile: AdminProfile = {
  name: 'Marco Rojas',
  email: 'marco@misender.com',
  company: 'MiSender Pro',
  role: 'Super Admin',
  initials: 'MR'
};

export function calculateInitials(name: string): string {
  if (!name || !name.trim()) return 'AD';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AdminProfileContextType {
  profile: AdminProfile;
  updateProfile: (updates: Partial<AdminProfile>) => void;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;
}

const AdminProfileContext = createContext<AdminProfileContextType | undefined>(undefined);

export function AdminProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AdminProfile>(defaultAdminProfile);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('misender_admin_profile');
      if (stored) {
        const parsed = JSON.parse(stored);
        setProfile({
          ...defaultAdminProfile,
          ...parsed,
          initials: calculateInitials(parsed.name || defaultAdminProfile.name)
        });
      }
    } catch (e) {
      console.warn('LocalStorage error reading admin profile:', e);
    }
  }, []);

  const updateProfile = (updates: Partial<AdminProfile>) => {
    setProfile(prev => {
      const nextName = updates.name !== undefined ? updates.name : prev.name;
      const next: AdminProfile = {
        ...prev,
        ...updates,
        initials: calculateInitials(nextName)
      };
      try {
        localStorage.setItem('misender_admin_profile', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  return (
    <AdminProfileContext.Provider
      value={{
        profile,
        updateProfile,
        isProfileModalOpen,
        setIsProfileModalOpen
      }}
    >
      {children}
    </AdminProfileContext.Provider>
  );
}

export function useAdminProfile() {
  const ctx = useContext(AdminProfileContext);
  if (!ctx) {
    throw new Error('useAdminProfile must be used within an AdminProfileProvider');
  }
  return ctx;
}
