
import {
  auth,
  googleProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "./firebase.js";

// HTML 요소
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userName = document.getElementById("user-name");
const chatContainer = document.getElementById("chat-container");

// Google 로그인
if (googleLoginBtn) {
  googleLoginBtn.addEventListener("click", async () => {
    googleLoginBtn.disabled = true;

    try {
      await signInWithPopup(auth, googleProvider);
      console.log("Google 로그인 성공");
    } catch (error) {
      console.error("Google 로그인 오류:", error);

      alert(
        error.code === "auth/unauthorized-domain"
          ? "로그인 도메인이 Firebase에 등록되어 있지 않습니다."
          : error.code === "auth/popup-blocked"
          ? "팝업이 차단되었습니다. 브라우저의 팝업 설정을 확인해 주세요."
          : "로그인에 실패했습니다: " + error.message
      );
    } finally {
      googleLoginBtn.disabled = false;
    }
  });
}

// 로그인 상태 감지
onAuthStateChanged(auth, (user) => {
  if (user) {
    // 로그인 상태
    if (googleLoginBtn) {
      googleLoginBtn.style.display = "none";
    }

    if (chatContainer) {
      chatContainer.style.display = "block";
    }

    if (userName) {
      userName.textContent =
        user.displayName || user.email || "사용자";
    }

    console.log("현재 로그인 사용자:", user.uid);
  } else {
    // 로그아웃 상태
    if (googleLoginBtn) {
      googleLoginBtn.style.display = "block";
    }

    if (chatContainer) {
      chatContainer.style.display = "none";
    }

    if (userName) {
      userName.textContent = "";
    }
  }
});

// 로그아웃
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      console.log("로그아웃 성공");
    } catch (error) {
      console.error("로그아웃 오류:", error);
      alert("로그아웃에 실패했습니다: " + error.message);
    }
  });
}
