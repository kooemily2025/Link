
import { auth, db, googleProvider } from "./firebase.js";

import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import { initFriends } from "./friends.js";
import { initRoom } from "./room.js";

const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginButton = document.getElementById("google-login-btn");
const logoutButton = document.getElementById("logout-btn");
const loginError = document.getElementById("login-error");

let currentUid = null;
let friendsController = null;
let roomController = null;

function explainError(error) {
  const messages = {
    "auth/unauthorized-domain":
      "Firebase Authentication의 승인된 도메인을 확인해 주세요.",
    "auth/popup-closed-by-user":
      "로그인 창이 닫혔어요. 다시 시도해 주세요.",
    "auth/popup-blocked":
      "로그인 팝업이 차단됐어요.",
    "auth/network-request-failed":
      "인터넷 연결을 확인해 주세요.",
    "auth/operation-not-allowed":
      "Firebase에서 Google 로그인을 활성화해 주세요.",
    "permission-denied":
      "Firestore 보안 규칙에서 요청이 거부됐어요."
  };

  return messages[error.code] ||
    `오류가 발생했어요: ${error.code || error.message}`;
}

function closeSession() {
  friendsController?.destroy();
  roomController?.destroy();

  friendsController = null;
  roomController = null;
  currentUid = null;
}

loginButton.addEventListener("click", async () => {
  loginButton.disabled = true;
  loginError.textContent = "";

  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (error.code === "auth/popup-blocked") {
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch (redirectError) {
        loginError.textContent = explainError(redirectError);
        loginButton.disabled = false;
      }
    } else {
      loginError.textContent = explainError(error);
      loginButton.disabled = false;
    }
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    await signOut(auth);
  } catch (error) {
    alert(explainError(error));
  } finally {
    logoutButton.disabled = false;
  }
});

getRedirectResult(auth).catch((error) => {
  loginError.textContent = explainError(error);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    closeSession();
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    loginButton.disabled = false;
    return;
  }

  if (currentUid === user.uid) return;

  closeSession();
  currentUid = user.uid;

  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  document.getElementById("user-name").textContent =
    user.displayName || user.email || "사용자";

  document.getElementById("user-photo").src =
    user.photoURL || "https://placehold.co/80x80?text=L";

  try {
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      displayName: user.displayName || "사용자",
      email: (user.email || "").toLowerCase(),
      photoURL: user.photoURL || "",
      updatedAt: serverTimestamp()
    }, { merge: true });

    if (auth.currentUser?.uid !== user.uid) return;

    roomController = initRoom(user);

    friendsController = initFriends(user, (friend) => {
      roomController?.openRoom(friend);
    });
  } catch (error) {
    console.error("앱 초기화 실패:", error);
    alert(explainError(error));
  }
});
