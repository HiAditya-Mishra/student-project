import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
apiKey: "AIzaSyB-lzYwo_cvWWjzk7MINKXbaYGTn0AhXac",
authDomain: "aditya-d29a8.firebaseapp.com",
projectId: "aditya-d29a8",
storageBucket: "aditya-d29a8.firebasestorage.app",
messagingSenderId: "67345808642",
appId: "1:67345808642:web:70521666952785ca39d61b"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
