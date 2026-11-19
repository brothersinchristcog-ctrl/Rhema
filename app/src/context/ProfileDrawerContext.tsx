import React, { createContext, useCallback, useContext, useState } from 'react';

interface ProfileDrawerContextValue {
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const ProfileDrawerContext = createContext<ProfileDrawerContextValue | null>(null);

export const ProfileDrawerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  return (
    <ProfileDrawerContext.Provider value={{ isOpen, openDrawer, closeDrawer }}>
      {children}
    </ProfileDrawerContext.Provider>
  );
};

export const useProfileDrawer = () => {
  const ctx = useContext(ProfileDrawerContext);
  return ctx;
};
