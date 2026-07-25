import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { sharedDocumentPath } from "./config.js";

const sharedRef = doc(db, ...sharedDocumentPath);

export function observeFinanceData(onData, onError) {
  return onSnapshot(sharedRef, snapshot => {
    onData(snapshot.exists() ? snapshot.data().state : null, snapshot.exists());
  }, onError);
}

export async function saveFinanceData(state, userEmail) {
  await setDoc(sharedRef, {
    state,
    updatedAt: serverTimestamp(),
    updatedBy: userEmail
  }, { merge: true });
}
