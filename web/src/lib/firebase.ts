import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAaBqR9uZhARSF6kvBNwu6BBikcHUsLoXo",
  authDomain: "rhema-global-ministries.firebaseapp.com",
  projectId: "rhema-global-ministries",
  storageBucket: "rhema-global-ministries.firebasestorage.app",
  messagingSenderId: "771098328860",
  appId: "1:771098328860:android:abc9c28a7098910080c4d9"
};

// Initialize Firebase only once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);


