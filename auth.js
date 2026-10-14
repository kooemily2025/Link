
import {
  auth, db, googleProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  query, where, orderBy, limit, onSnapshot,
  serverTimestamp, runTransaction
} from "./firebase.js";

const $ = id => document.getElementById(id);

let me = null;
let myProfile = null;
let friends = [];
let activeChat = null;
let stopFriends = null;
let stopChats = null;
let stopMessages = null;
let toastTimer;

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() =>
    $("toast").classList.remove("show"), 2600);
}

function errorMessage(error) {
  console.error(error);
  const messages = {
    "permission-denied": "권한이 없습니다. Firestore 보안 규칙을 확인하세요.",
    "not-found": "사용자를 찾을 수 없습니다.",
    "already-exists": "이미 존재하는 데이터입니다.",
    "unavailable": "서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요."
  };
  return messages[error.code] ||
    error.message || "요청을 처리하지 못했습니다.";
}

function safeName(value) {
  return String(value || "사용자").slice(0, 80);
}

function avatarURL(url) {
  return url || "https://www.gravatar.com/avatar/?d=mp&s=96";
}

function clearListeners() {
  [stopFriends, stopChats, stopMessages].forEach(stop => {
    if (stop) stop();
  });
  stopFriends = stopChats = stopMessages = null;
}

function setSignedIn(isSignedIn) {
  $("login-screen").classList.toggle("hidden", isSignedIn);
  $("app").classList.toggle("hidden", !isSignedIn);
}

function makeFriendCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "@";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function ensureProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    const data = snap.data();

    // 예전 프로필에 ID가 없다면 새로 부여한다.
    if (!data.friendCode) {
      let code;
      for (let i = 0; i < 5; i++) {
        code = makeFriendCode();
        try {
          await runTransaction(db, async tx => {
            const current = await tx.get(userRef);
            if (current.data()?.friendCode) return;
            tx.update(userRef, { friendCode: code });
          });
          break;
        } catch (error) {
          if (i === 4) throw error;
        }
      }
    }

    await updateDoc(userRef, {
      displayName: safeName(user.displayName),
      photoURL: user.photoURL || "",
      lastSeen: serverTimestamp()
    });

    return (await getDoc(userRef)).data();
  }

  let profile;
  for (let i = 0; i < 8; i++) {
    const code = makeFriendCode();
    const q = query(
      collection(db, "users"),
      where("friendCode", "==", code),
      limit(1)
    );
    const result = await getDocs(q);
    if (result.empty) {
      profile = {
        uid: user.uid,
        displayName: safeName(user.displayName),
        photoURL: user.photoURL || "",
        friendCode: code,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      };
      break;
    }
  }

  if (!profile) throw new Error("사용자 ID 생성에 실패했습니다.");

  await setDoc(userRef, profile);
  return (await getDoc(userRef)).data();
}

async function startApp(user) {
  clearListeners();
  me = user;

  try {
    myProfile = await ensureProfile(user);
    setSignedIn(true);

    $("my-name").textContent = safeName(myProfile.displayName);
    $("my-code").textContent = myProfile.friendCode || "";
    $("my-photo").src = avatarURL(myProfile.photoURL);

    listenFriends();
    listenChats();
  } catch (error) {
    toast(errorMessage(error));
  }
}

$("google-login").addEventListener("click", async () => {
  $("login-error").textContent = "";
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    // 모바일 등에서 팝업이 차단되면 리디렉션 로그인을 시도한다.
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"]
      .includes(error.code)) {
      try {
        await signInWithRedirect(auth, googleProvider);
        return;
      } catch (redirectError) {
        error = redirectError;
      }
    }
    $("login-error").textContent = errorMessage(error);
  }
});

getRedirectResult(auth).catch(error => {
  $("login-error").textContent = errorMessage(error);
});

onAuthStateChanged(auth, user => {
  if (user) {
    startApp(user);
  } else {
    clearListeners();
    me = null;
    myProfile = null;
    friends = [];
    activeChat = null;
    setSignedIn(false);
  }
});

$("logout").addEventListener("click", async () => {
  try {
    clearListeners();
    await signOut(auth);
  } catch (error) {
    toast(errorMessage(error));
  }
});

// 친구 목록
function listenFriends() {
  if (stopFriends) stopFriends();

  stopFriends = onSnapshot(
    collection(db, "users", me.uid, "friends"),
    async snapshot => {
      try {
        const results = await Promise.all(snapshot.docs.map(async item => {
          const snap = await getDoc(doc(db, "users", item.id));
          if (!snap.exists()) return null;
          return { uid: item.id, ...snap.data() };
        }));

        friends = results.filter(Boolean);
        renderFriends();
      } catch (error) {
        toast(errorMessage(error));
      }
    },
    error => toast(errorMessage(error))
  );
}

function renderFriends() {
  const container = $("friends-list");
  container.replaceChildren();

  if (!friends.length) {
    container.textContent = "아직 친구가 없습니다.";
    return;
  }

  friends.forEach(friend => {
    const row = document.createElement("div");
    row.className = "person-row";

    const img = document.createElement("img");
    img.className = "avatar";
    img.src = avatarURL(friend.photoURL);
    img.alt = "";

    const info = document.createElement("div");
    info.className = "person-info";

    const name = document.createElement("strong");
    name.textContent = safeName(friend.displayName);

    const code = document.createElement("small");
    code.textContent = friend.friendCode || "";

    info.append(name, code);
    row.append(img, info);

    const button = document.createElement("button");
    button.className = "secondary-button";
    button.textContent = "채팅";
    button.addEventListener("click", () => openDirectChat(friend));
    row.append(button);

    container.append(row);
  });
}

$("add-friend-toggle").addEventListener("click", () => {
  $("add-friend-form").classList.toggle("hidden");
});

$("add-friend-form").addEventListener("submit", async event => {
  event.preventDefault();

  const code = $("friend-code").value.trim().toUpperCase();
  $("friend-status").textContent = "검색 중...";

  try {
    if (!/^@[A-Z2-9]{8}$/.test(code)) {
      throw new Error("친구 ID 형식이 올바르지 않습니다.");
    }

    const q = query(
      collection(db, "users"),
      where("friendCode", "==", code),
      limit(2)
    );
    const result = await getDocs(q);

    if (result.empty) throw new Error("해당 ID의 사용자가 없습니다.");
    if (result.size !== 1) throw new Error("ID가 중복되었습니다.");

    const target = result.docs[0];
    if (target.id === me.uid) {
      throw new Error("자신은 친구로 추가할 수 없습니다.");
    }

    const targetFriendRef =
      doc(db, "users", target.id, "friends", me.uid);

    const targetFriend = await getDoc(targetFriendRef);

    // 친구 관계는 서로 친구 추가를 했을 때 성립한다.
    if (!targetFriend.exists()) {
      await setDoc(
        doc(db, "users", me.uid, "friends", target.id),
        {
          createdAt: serverTimestamp()
        }
      );
      toast("친구 요청을 보냈습니다. 상대방도 나를 추가해야 친구가 됩니다.");
    } else {
      await setDoc(
        doc(db, "users", me.uid, "friends", target.id),
        { createdAt: serverTimestamp() }
      );
      toast("친구 목록에 추가했습니다.");
    }

    $("friend-code").value = "";
    $("friend-status").textContent = "";
  } catch (error) {
    $("friend-status").textContent = errorMessage(error);
  }
});

// 친구 추가는 요청 방식이다.
// 친구 요청을 받은 사용자가 자기 친구 목록에서 상대방을 추가하면
// 서로 친구인 상태가 된다.
$("show-friends").addEventListener("click", () => {
  $("show-friends").classList.add("active");
  $("show-chats").classList.remove("active");
  $("list-heading").textContent = "친구 목록";
  $("friends-list").classList.remove("hidden");
  $("chats-list").classList.add("hidden");
});

$("show-chats").addEventListener("click", () => {
  $("show-chats").classList.add("active");
  $("show-friends").classList.remove("active");
  $("list-heading").textContent = "채팅 목록";
  $("friends-list").classList.add("hidden");
  $("chats-list").classList.remove("hidden");
});

// 1:1 채팅방 ID는 두 UID로 결정해 중복 생성을 방지한다.
function directChatId(uid1, uid2) {
  return "dm_" + [uid1, uid2].sort().join("_");
}

async function openDirectChat(friend) {
  try {
    const reverseFriend = await getDoc(
      doc(db, "users", friend.uid, "friends", me.uid)
    );

    if (!reverseFriend.exists()) {
      toast("상대방도 나를 친구로 추가해야 채팅할 수 있습니다.");
      return;
    }

    const chatId = directChatId(me.uid, friend.uid);
    const chatRef = doc(db, "chats", chatId);
    const snap = await getDoc(chatRef);

    if (!snap.exists()) {
      await setDoc(chatRef, {
        type: "direct",
        name: "",
        members: [me.uid, friend.uid].sort(),
        createdBy: me.uid,
        createdAt: serverTimestamp(),
        lastMessage: "",
        lastMessageAt: serverTimestamp()
      });
    }

    await selectChat(chatId);
  } catch (error) {
    toast(errorMessage(error));
  }
}

// 채팅방 목록
function listenChats() {
  if (stopChats) stopChats();

  const q = query(
    collection(db, "chats"),
    where("members", "array-contains", me.uid)
  );

  stopChats = onSnapshot(q, snapshot => {
    const chats = snapshot.docs.map(d => ({
      id: d.id, ...d.data()
    }));

    chats.sort((a, b) => {
      const ta = a.lastMessageAt?.toMillis?.() || 0;
      const tb = b.lastMessageAt?.toMillis?.() || 0;
      return tb - ta;
    });

    renderChats(chats);
  }, error => toast(errorMessage(error)));
}

function renderChats(chats) {
  const container = $("chats-list");
  container.replaceChildren();

  if (!chats.length) {
    container.textContent = "채팅방이 없습니다.";
    return;
  }

  chats.forEach(chat => {
    const row = document.createElement("div");
    row.className = "person-row" +
      (activeChat?.id === chat.id ? " selected" : "");

    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";
    avatar.textContent = chat.type === "group" ? "G" : "L";

    const info = document.createElement("div");
    info.className = "person-info";

    const title = document.createElement("strong");
    title.textContent = chat.type === "group"
      ? chat.name || "그룹 채팅"
      : "1:1 채팅";

    const preview = document.createElement("small");
    preview.textContent = chat.lastMessage || "대화를 시작해 보세요";

    info.append(title, preview);
    row.append(avatar, info);
    row.addEventListener("click", () => selectChat(chat.id));
    container.append(row);
  });
}

async function selectChat(chatId) {
  try {
    const snap = await getDoc(doc(db, "chats", chatId));
    if (!snap.exists()) throw new Error("채팅방을 찾을 수 없습니다.");

    const chat = { id: snap.id, ...snap.data() };
    if (!chat.members?.includes(me.uid)) {
      throw new Error("이 채팅방의 멤버가 아닙니다.");
    }

    activeChat = chat;

    $("welcome").classList.add("hidden");
    $("chat-panel").classList.remove("hidden");
    $("chat-title").textContent = chat.type === "group"
      ? chat.name || "그룹 채팅"
      : await directChatTitle(chat);

    $("chat-subtitle").textContent =
      chat.type === "group"
        ? `${chat.members.length}명 참여 중`
        : "1:1 대화";

    $("chat-avatar").textContent =
      chat.type === "group" ? "G" : "L";

    $("invite-member").classList.toggle(
      "hidden", chat.type !== "group"
    );

    if (stopMessages) stopMessages();

    const messagesQuery = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc"),
      limit(200)
    );

    stopMessages = onSnapshot(messagesQuery, snapshot => {
      const messages = snapshot.docs.map(d => ({
        id: d.id, ...d.data()
      }));
      renderMessages(messages);
    }, error => toast(errorMessage(error)));
  } catch (error) {
    toast(errorMessage(error));
  }
}

async function directChatTitle(chat) {
  const otherUid = chat.members.find(uid => uid !== me.uid);
  if (!otherUid) return "나와의 채팅";

  const snap = await getDoc(doc(db, "users", otherUid));
  return snap.exists()
    ? safeName(snap.data().displayName)
    : "친구";
}

function renderMessages(messages) {
  const container = $("messages");
  container.replaceChildren();

  messages.forEach(message => {
    const mine = message.senderId === me.uid;
    const wrapper = document.createElement("div");
    wrapper.className = "message" + (mine ? " mine" : "");

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = mine ? "나" : safeName(message.senderName);

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = message.text || "";

    wrapper.append(meta, bubble);
    container.append(wrapper);
  });

  container.scrollTop = container.scrollHeight;
}

// 메시지 보내기
$("message-form").addEventListener("submit", async event => {
  event.preventDefault();

  const text = $("message-input").value.trim();
  if (!text || !activeChat || !me) return;

  const chat = activeChat;
  const input = $("message-input");
  input.value = "";

  try {
    const chatRef = doc(db, "chats", chat.id);

    await runTransaction(db, async tx => {
      const snap = await tx.get(chatRef);

      if (!snap.exists()) throw new Error("채팅방이 없습니다.");

      const data = snap.data();
      if (!data.members?.includes(me.uid)) {
        throw new Error("채팅방 참여자가 아닙니다.");
      }

      const messageRef = doc(
        collection(db, "chats", chat.id, "messages")
      );

      tx.set(messageRef, {
        senderId: me.uid,
        senderName: safeName(myProfile.displayName),
        text,
        createdAt: serverTimestamp()
      });

      tx.update(chatRef, {
        lastMessage: text.slice(0, 100),
        lastMessageAt: serverTimestamp()
      });
    });
  } catch (error) {
    input.value = text;
    toast(errorMessage(error));
  }
});

// 친구 선택창
function fillFriendOptions(containerId, excluded = []) {
  const container = $(containerId);
  container.replaceChildren();

  const available = friends.filter(
    friend => !excluded.includes(friend.uid)
  );

  if (!available.length) {
    container.textContent = "선택할 수 있는 친구가 없습니다.";
    return;
  }

  available.forEach(friend => {
    const label = document.createElement("label");
    label.className = "group-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = friend.uid;

    const text = document.createElement("span");
    text.textContent = safeName(friend.displayName) +
      " (" + (friend.friendCode || "") + ")";

    label.append(checkbox, text);
    container.append(label);
  });
}

function selectedUids(containerId) {
  return [...$(containerId).querySelectorAll(
    'input[type="checkbox"]:checked'
  )].map(input => input.value);
}

// 그룹 생성
$("create-group").addEventListener("click", () => {
  $("group-name").value = "";
  fillFriendOptions("group-friend-options");
  $("group-dialog").showModal();
});

$("cancel-group").addEventListener("click", () =>
  $("group-dialog").close()
);

$("group-form").addEventListener("submit", async event => {
  event.preventDefault();

  const name = $("group-name").value.trim();
  const invitees = selectedUids("group-friend-options");

  if (!name) return toast("그룹 이름을 입력하세요.");
  if (!invitees.length) return toast("친구를 한 명 이상 선택하세요.");

  try {
    const members = [...new Set([me.uid, ...invitees])];

    // 친구 목록에 있는 사람만 그룹에 초대할 수 있다.
    if (invitees.some(uid => !friends.some(f => f.uid === uid))) {
      throw new Error("친구 목록을 다시 확인하세요.");
    }

    const newChat = await addDoc(collection(db, "chats"), {
      type: "group",
      name,
      members,
      createdBy: me.uid,
      createdAt: serverTimestamp(),
      lastMessage: "그룹이 생성되었습니다.",
      lastMessageAt: serverTimestamp()
    });

    await addDoc(collection(db, "chats", newChat.id, "messages"), {
      senderId: me.uid,
      senderName: safeName(myProfile.displayName),
      text: "그룹이 생성되었습니다.",
      createdAt: serverTimestamp()
    });

    $("group-dialog").close();
    await selectChat(newChat.id);
    toast("그룹 채팅방을 만들었습니다.");
  } catch (error) {
    toast(errorMessage(error));
  }
});

// 기존 그룹에 친구 초대
$("invite-member").addEventListener("click", () => {
  if (!activeChat || activeChat.type !== "group") return;

  fillFriendOptions(
    "invite-friend-options",
    activeChat.members
  );

  $("invite-dialog").showModal();
});

$("cancel-invite").addEventListener("click", () =>
  $("invite-dialog").close()
);

$("invite-form").addEventListener("submit", async event => {
  event.preventDefault();

  if (!activeChat || activeChat.type !== "group") return;

  const chat = activeChat;
  const invitees = selectedUids("invite-friend-options");

  if (!invitees.length) return toast("초대할 친구를 선택하세요.");

  try {
    if (invitees.some(uid => !friends.some(f => f.uid === uid))) {
      throw new Error("친구 목록을 확인하세요.");
    }

    const chatRef = doc(db, "chats", chat.id);

    await runTransaction(db, async tx => {
      const snap = await tx.get(chatRef);
      if (!snap.exists()) throw new Error("채팅방이 없습니다.");

      const data = snap.data();
      if (data.type !== "group" ||
          !data.members?.includes(me.uid)) {
        throw new Error("그룹 멤버만 친구를 초대할 수 있습니다.");
      }

      const members = [...new Set([
        ...data.members, ...invitees
      ])];

      tx.update(chatRef, { members });
    });

    $("invite-dialog").close();
    await selectChat(chat.id);
    toast("친구를 그룹에 초대했습니다.");
  } catch (error) {
    toast(errorMessage(error));
  }
});
