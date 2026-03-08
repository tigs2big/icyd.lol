# icyd.lol 🔗

Your own guns.lol style profile link platform.

---

## 🚀 Deploy to Render (FREE — step by step)

### Step 1: Get the code on GitHub
1. Go to **github.com** and sign up (free)
2. Click the **+** button → **New repository**
3. Name it `icyd` → click **Create repository**
4. Upload all these files to the repo (drag and drop)

### Step 2: Create a Render account
1. Go to **render.com** → Sign up with GitHub
2. Click **New +** → **Web Service**
3. Connect your GitHub repo `icyd`
4. Settings:
   - **Name:** icyd
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Click **Create Web Service**

### Step 3: Add a Database
1. In Render dashboard → **New +** → **PostgreSQL**
2. Name it `icyd-db` → Free tier → Create
3. Copy the **Internal Database URL**

### Step 4: Set Environment Variables
In your Render web service → **Environment** tab, add:

```
DISCORD_CLIENT_ID=1480170323549884509
DISCORD_CLIENT_SECRET=tYq_I9OCfQCyBVMFZhc8iIhcLe8vWTjM
DISCORD_REDIRECT_URI=https://YOUR-APP-NAME.onrender.com/auth/discord/callback
DATABASE_URL=<paste your Internal Database URL from step 3>
SESSION_SECRET=pick-any-random-words-here-123
ADMIN_PASSWORD=choose-your-admin-password
CASHAPP_TAG=$ti2big
DISCORD_SERVER=https://discord.gg/6vgcrdkvYX
BASE_URL=https://YOUR-APP-NAME.onrender.com
```

⚠️ Replace `YOUR-APP-NAME` with whatever Render names your app

### Step 5: Set Discord Redirect URI
1. Go to **discord.com/developers/applications**
2. Open your icyd app → **OAuth2**
3. Under **Redirects** add: `https://YOUR-APP-NAME.onrender.com/auth/discord/callback`
4. Save changes

### Step 6: You're live! 🎉
Your site will be at `https://YOUR-APP-NAME.onrender.com`

---

## 🛠 How to give badges

1. Someone pays $3.99 to **$ti2big** on CashApp
2. They open a ticket in your Discord with proof
3. You go to `yoursite.onrender.com/admin`
4. Password: whatever you set as `ADMIN_PASSWORD`
5. Type their username → select badge → click **Give Badge** ✅

---

## 📁 File structure

```
icyd/
├── server.js          ← backend (Node/Express)
├── package.json       ← dependencies
├── .env.example       ← env variables template
├── public/
│   ├── index.html     ← homepage
│   ├── profile.html   ← user profile page
│   ├── dashboard.html ← user dashboard
│   ├── get-badge.html ← badge pricing page
│   ├── admin.html     ← admin panel
│   ├── admin-login.html
│   └── 404.html
```

---

## 💰 Badge prices
- ✅ Verified — $3.99
- 👑 Premium — $7.99
- 💎 Supporter — $1.99
- ⭐ OG — exclusive (first 100 users)
- 🔥 Staff — admin only

---

Made with 🔥 for icyd.lol
