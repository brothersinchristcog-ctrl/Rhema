import React, { useContext } from 'react';
import { AdminTabContext } from '../../context/AdminTabContext';
import AdminZoomMeetingsCreate from './AdminZoomMeetingsCreate';

export default function AdminOnlineMeetingEditor() {
  const { setTabByName, goBack } = useContext(AdminTabContext) as any;

  const handleBack = () => {
    if (setTabByName) {
      setTabByName('Online Meetings');
    } else if (goBack) {
      goBack();
    }
  };

  return <AdminZoomMeetingsCreate onBack={handleBack} />;
}
