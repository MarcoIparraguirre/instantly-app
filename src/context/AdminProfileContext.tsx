'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AdminProfile {
  name: string;
  email: string;
  company: string;
  role: string;
  roleId: string;
  initials: string;
}

const defaultAdminProfile: AdminProfile = {
  name: 'Marco Iparraguirre',
  email: 'marcos@vectrasystems.com.ar',
  company: 'Vectra Systems',
  role: 'Super Admin',
  roleId: 'super_admin',
  initials: 'MI'
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
    // 1. Load from localStorage for instant initial render
    try {
      const stored = localStorage.getItem('misender_admin_profile');
      if (stored) {
        const parsed = JSON.parse(stored);
        setProfile(prev => ({
          ...prev,
          ...parsed,
          initials: calculateInitials(parsed.name || prev.name)
        }));
      }
    } catch (e) {}

    // 2. Fetch fresh record from Supabase / DB
    fetch('/api/user-profile')
      .then(res => res.json())
      .then(data => {
        if (data && data.fullName) {
          const freshProfile: AdminProfile = {
            name: data.fullName,
            email: data.email,
            company: data.company,
            role: data.roleName || 'Super Admin',
            roleId: data.roleId || 'super_admin',
            initials: calculateInitials(data.fullName)
          };
          setProfile(freshProfile);
          try {
            localStorage.setItem('misender_admin_profile', JSON.stringify(freshProfile));
          } catch (e) {}
        }
      })
      .catch(err => console.warn('Error fetching user profile from DB:', err));
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

      // Persist to Supabase in background
      fetch('/api/user-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: next.name,
          email: next.email,
          company: next.company,
          roleId: next.roleId || 'super_admin'
        })
      }).catch(err => console.error('Error saving user profile to DB:', err));

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
