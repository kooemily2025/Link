
import { db } from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

export function initRoom(user) {
  const $ = (id) => document.getElementById(id);

  const welcome = $("welcome-panel");
  const panel = $("room-panel");
  const title = $("room-title");
  const photo = $("room-photo");
  const messages = $("messages-list");
  const form = $("message-form");
  const input = $("message-input");
  const sendButton = $("send-btn");
  const errorText = $("message-error");

  let roomId = null;
  let activeFriend = null;
  let unsubscribeMessages = null;
  let stopped = false;
  let sending = false;
  let openSequence = 0;

  function clearSubscription() {
    if (unsubscribeMessages) {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }

    roomId = null;
    activeFriend = null;
    messages.replaceChildren();
  }

  function showError(message = "") {
    errorText.textContent = message;
  }

  function displayMessage(data) {
    const mine = data.senderId === user.uid;

    const row = document.createElement("div");
    row.className = `message${mine ? " mine" : ""}`;

    const author = document.createElement("div");
    author.className = "message-author";
    author.textContent = mine
      ? "나"
      : (activeFriend?.displayName || "친구");

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = data.text || "";

    const time = document.createElement("div");
    time.className = "message-time";

    if (data.createdAt?.toDate) {
      time.textContent = data.createdAt.toDate().toLocaleTimeString(
        "ko-KR",
        { hour: "2-digit", minute: "2-digit" }
      );
    }

    row.append(author, bubble, time);
    messages.append(row);
  }

  async function openRoom(friend) {
    if (stopped || !friend?.uid || friend.uid === user.uid) return;

    const sequence = ++openSequence;
    clearSubscription();

    welcome.classList.add("hidden");
    panel.classList.remove("hidden");
    showError("");

    title.textContent = friend.displayName || friend.email || "친구";
    photo.src = friend.photoURL ||
      "https://placehold.co/80x80?text=L";

    activeFriend = friend;

    try {
      const friendship = await getDoc(
        doc(db, "users", user.uid, "friends", friend.uid)
      );

      if (stopped || sequence !== openSequence) return;

      if (!friendship.exists()) {
        showError("친구로 등록된 사용자와만 대화할 수 있어요.");
        return;
      }

      // 양쪽 사용자 모두 동일한 ID를 생성
      const members = [user.uid, friend.uid].sort();
      const id = `${members[0]}_${members[1]}`;

      await setDoc(doc(db, "chatRooms", id), {
        members,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (stopped || sequence !== openSequence) return;

      roomId = id;

      unsubscribeMessages = onSnapshot(
        query(
          collection(db, "chatRooms", id, "messages"),
          orderBy("createdAt", "asc")
        ),
        (snapshot) => {
          if (stopped || sequence !== openSequence) return;

          messages.replaceChildren();

          snapshot.forEach((item) => {
            displayMessage(item.data());
          });

          messages.scrollTop = messages.scrollHeight;
        },
        (error) => {
          console.error("메시지 수신 오류:", error);
          showError("메시지를 불러오지 못했어요. 보안 규칙을 확인해 주세요.");
        }
      );
    } catch (error) {
      console.error("채팅방 열기 오류:", error);
      showError(
        "채팅방을 열지 못했어요. 친구 관계와 Firestore 규칙을 확인해 주세요."
      );
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = input.value.trim();
    const selectedRoom = roomId;
    const selectedFriend = activeFriend;

    if (!text || !selectedRoom || !selectedFriend || sending) return;

    sending = true;
    sendButton.disabled = true;
    showError("");

    try {
      const friendship = await getDoc(
        doc(db, "users", user.uid, "friends", selectedFriend.uid)
      );

      if (!friendship.exists()) {
        throw new Error("친구 관계가 확인되지 않아요.");
      }

      await addDoc(
        collection(db, "chatRooms", selectedRoom, "messages"),
        {
          senderId: user.uid,
          text,
          createdAt: serverTimestamp()
        }
      );

      if (roomId === selectedRoom) {
        input.value = "";
      }
    } catch (error) {
      console.error("메시지 전송 오류:", error);
      showError(
        "메시지를 보내지 못했어요. 인터넷 연결과 Firestore 규칙을 확인해 주세요."
      );
    } finally {
      sending = false;
      sendButton.disabled = false;
    }
  });

  return {
    openRoom,

    destroy() {
      stopped = true;
      openSequence++;
      clearSubscription();
      panel.classList.add("hidden");
      welcome.classList.remove("hidden");
    }
  };
}
