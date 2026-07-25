import {
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, googleProvider } from "./firebase.js";
import { allowedUsers } from "./config.js";

export function profileForEmail(email = "") {
  return allowedUsers[email.toLowerCase()] || null;
}

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const profile = profileForEmail(result.user.email);
  if (!profile) {
    await signOut(auth);
    throw new Error("Esta cuenta de Google no está autorizada.");
  }
  return { user: result.user, profile };
}

export function observeSession(callback) {
  return onAuthStateChanged(auth, async user => {
    if (!user) {
      callback({ user: null, profile: null });
      return;
    }
    const profile = profileForEmail(user.email);
    if (!profile) {
      await signOut(auth);
      callback({ user: null, profile: null, error: "Cuenta no autorizada." });
      return;
    }
    callback({ user, profile });
  });
}

export function logout() {
  return signOut(auth);
}
