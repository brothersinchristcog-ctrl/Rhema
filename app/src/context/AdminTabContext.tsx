import React, { createContext } from 'react';

export interface AdminTabContextType {
  activeTab: number;
  setActiveTab: (index: number) => void;
  editingData: any;
  setEditingData: (data: any) => void;
  goBack: () => void;
  setTabByName?: (name: string) => void;
  dashboardScrollY?: number;
  getDashboardScrollY?: () => number;
  setDashboardScrollY?: (y: number) => void;
}

export const AdminTabContext = createContext<AdminTabContextType>({
  activeTab: 0,
  setActiveTab: () => {},
  editingData: null,
  setEditingData: () => {},
  goBack: () => {},
  setTabByName: () => {},
  dashboardScrollY: 0,
  getDashboardScrollY: () => 0,
  setDashboardScrollY: () => {},
});
