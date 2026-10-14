
import { db } from "./firebase.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

export function initFriends(user, openRoom) {
  const $ = (id) => document.getElementById(id);

  const friendsList = $("friends-list");
  const requestsList = $("requests-list");
  const searchForm = $("search-form");
  const searchInput = $("search-input");
  const searchResults = $("search-results");
  const friendsTab = $("friends-tab");
  const requestsTab = $("requests-tab");
  const friendsPanel = $("friends-panel");
  const requestsPanel = $("requests-panel");
  const requestCount = $("request-count");

  const unsubscribers = [];
  let stopped = false;
  let selectedUid = null;

  function listen(ref, callback, errorCallback) {
    unsubscribers.push(onSnapshot(ref, callback, errorCallback));
  }

  function button(text, handler) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "action-btn";
    element.textContent = text;
    element.addEventListener("click", handler);
    return element;
  }

  function switchTab(showRequests) {
    friendsTab.classList.toggle("active", !showRequests);
    requestsTab.classList.toggle("active", showRequests);
    friendsPanel.classList.toggle("hidden", showRequests);
    requestsPanel.classList.toggle("hidden", !showRequests);
  }

  friendsTab.addEventListener("click", () => switchTab(false));
  requestsTab.addEventListener("click", () => switchTab(true));

  function makeFriendRow(friend) {
    const row = document.createElement("div");
    row.className = "friend-item";

    if (friend.uid === selectedUid) {
      row.classList.add("selected");
    }

    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.alt = "";
    avatar.src = friend.photoURL ||
      "https://placehold.co/80x80?text=L";

    const info = document.createElement("div");
    info.className = "friend-info";

    const name = document.createElement("div");
    name.className = "friend-name";
    name.textContent = friend.displayName || "사용자";

    const email = document.createElement("div");
    email.className = "friend-email";
    email.textContent = friend.email || "";

    info.append(name, email);

    const chatButton = button("채팅", () => {
      selectedUid = friend.uid;
      renderFriends();
      openRoom(friend);
    });

    row.append(avatar, info, chatButton);

    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;

      selectedUid = friend.uid;
      renderFriends();
      openRoom(friend);
    });

    return row;
  }

  let currentFriends = [];

  function renderFriends() {
    friendsList.replaceChildren();

    if (currentFriends.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "아직 친구가 없어요.";
      friendsList.append(empty);
      return;
    }

    currentFriends.forEach((friend) => {
      friendsList.append(makeFriendRow(friend));
    });
  }

  listen(
    collection(db, "users", user.uid, "friends"),
    async (snapshot) => {
      try {
        const result = await Promise.all(snapshot.docs.map(
          async (friendDoc) => {
            const profile = await getDoc(
              doc(db, "users", friendDoc.id)
            );

            if (!profile.exists()) return null;

            return {
              uid: friendDoc.id,
              ...profile.data()
            };
          }
        ));

        if (stopped) return;

        currentFriends = result
          .filter(Boolean)
          .sort((a, b) =>
            (a.displayName || "").localeCompare(b.displayName || "")
          );

        renderFriends();
      } catch (error) {
        console.error(error);
        friendsList.textContent = "친구 목록을 불러오지 못했어요.";
      }
    },
    (error) => {
      console.error(error);
      friendsList.textContent = "친구 목록 접근 권한이 없어요.";
    }
  );

  listen(
    query(
      collection(db, "friendRequests"),
      where("to", "==", user.uid),
      where("status", "==", "pending")
    ),
    async (snapshot) => {
      requestCount.textContent = snapshot.size
        ? `(${snapshot.size})`
        : "";

      requestsList.replaceChildren();

      const pending = snapshot.docs;

      for (const requestDoc of pending) {
        const request = requestDoc.data();

        const profile = await getDoc(
          doc(db, "users", request.from)
        );

        if (stopped || !profile.exists()) continue;

        const sender = profile.data();
        const row = document.createElement("div");
        row.className = "request-item";

        const name = document.createElement("div");
        name.className = "friend-name";
        name.textContent = sender.displayName || "사용자";

        const email = document.createElement("div");
        email.className = "friend-email";
        email.textContent = sender.email || "";

        const accept = button("수락", async () => {
          accept.disabled = true;

          try {
            await runTransaction(db, async (tx) => {
              const requestRef = doc(
                db, "friendRequests", requestDoc.id
              );
              const fresh = await tx.get(requestRef);

              if (!fresh.exists()) {
                throw new Error("친구 요청이 존재하지 않아요.");
              }

              const data = fresh.data();

              if (
                data.to !== user.uid ||
                data.status !== "pending"
              ) {
                throw new Error("이미 처리된 요청이에요.");
              }

              tx.update(requestRef, {
                status: "accepted",
                updatedAt: serverTimestamp()
              });

              tx.set(
                doc(db, "users", user.uid, "friends", data.from),
                { uid: data.from, since: serverTimestamp() }
              );

              tx.set(
                doc(db, "users", data.from, "friends", user.uid),
                { uid: user.uid, since: serverTimestamp() }
              );
            });
          } catch (error) {
            console.error(error);
            alert("수락하지 못했어요. Firestore 규칙을 확인해 주세요.");
            accept.disabled = false;
          }
        });

        const reject = button("거절", async () => {
          reject.disabled = true;

          try {
            await updateDoc(
              doc(db, "friendRequests", requestDoc.id),
              {
                status: "rejected",
                updatedAt: serverTimestamp()
              }
            );
          } catch (error) {
            console.error(error);
            alert("거절하지 못했어요.");
            reject.disabled = false;
          }
        });

        row.append(name, email, accept, reject);
        requestsList.append(row);
      }
    },
    (error) => {
      console.error(error);
      requestsList.textContent = "친구 요청을 불러오지 못했어요.";
    }
  );

  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = searchInput.value.trim().toLowerCase();
    searchResults.replaceChildren();

    if (!email) return;

    const loading = document.createElement("p");
    loading.className = "muted";
    loading.textContent = "검색 중...";
    searchResults.append(loading);

    try {
      const results = await getDocs(
        query(
          collection(db, "users"),
          where("email", "==", email)
        )
      );

      if (stopped) return;

      searchResults.replaceChildren();

      const foundUsers = results.docs.filter(
        (item) => item.id !== user.uid
      );

      if (foundUsers.length === 0) {
        searchResults.textContent = "사용자를 찾을 수 없어요.";
        return;
      }

      for (const result of foundUsers) {
        const profile = result.data();
        const row = document.createElement("div");
        row.className = "request-item";

        const name = document.createElement("div");
        name.className = "friend-name";
        name.textContent = profile.displayName || "사용자";

        const emailText = document.createElement("div");
        emailText.className = "friend-email";
        emailText.textContent = profile.email || "";

        const add = button("친구 요청", async () => {
          add.disabled = true;

          try {
            const friendRef = doc(
              db, "users", user.uid, "friends", result.id
            );
            const reverseRequestId = `${result.id}_${user.uid}`;
            const reverseRequestRef = doc(
              db, "friendRequests", reverseRequestId
            );

            const [friend, reverseRequest] = await Promise.all([
              getDoc(friendRef),
              getDoc(reverseRequestRef)
            ]);

            if (friend.exists()) {
              alert("이미 친구예요.");
              return;
            }

            if (
              reverseRequest.exists() &&
              reverseRequest.data().status === "pending"
            ) {
              alert("상대방이 보낸 요청을 확인해 보세요.");
              return;
            }

            const requestId = `${user.uid}_${result.id}`;

            await setDoc(doc(db, "friendRequests", requestId), {
              from: user.uid,
              to: result.id,
              status: "pending",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });

            alert("친구 요청을 보냈어요.");
          } catch (error) {
            console.error(error);
            alert("요청에 실패했어요. 이메일과 Firestore 규칙을 확인해 주세요.");
          } finally {
            add.disabled = false;
          }
        });

        row.append(name, emailText, add);
        searchResults.append(row);
      }
    } catch (error) {
      console.error(error);
      searchResults.replaceChildren();
      searchResults.textContent =
        "검색에 실패했어요. Firestore 규칙을 확인해 주세요.";
    }
  });

  return {
    destroy() {
      stopped = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    }
  };
}
