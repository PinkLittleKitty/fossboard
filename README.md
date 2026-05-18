# FOSSBoard

A free, serverless, secure HTTPS-enabled alternative to dreamlo. Easily host real-time high scores, times, and custom metadata for your Unity, Godot, WebGL, or Python games, completely serverless.

[![GitHub Pages Deployment](https://img.shields.io/badge/Deploy%20To-GitHub%20Pages-blue?style=for-the-badge&logo=github)](https://pages.github.com/)
[![Deno Deploy](https://img.shields.io/badge/Serverless-Deno%20Deploy-black?style=for-the-badge&logo=deno)](https://deno.com/deploy)
[![Cloudflare Workers](https://img.shields.io/badge/Serverless-Cloudflare%20Workers-orange?style=for-the-badge&logo=cloudflare)](https://workers.cloudflare.com/)
[![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)](LICENSE)

---

## Why FOSSBoard?

Most indie developers and game jammers love **dreamlo** for its simplicity. However, standard dreamlo is hosted on `http://`, and getting an `https://` endpoint requires a paid donation. Because modern web browsers block mixed-content (loading `http` assets from `https` websites), web-based games (such as itch.io WebGL, HTML5 games) fail to retrieve or submit scores from dreamlo.

**FOSSBoard** resolves this by providing:
1. **Native HTTPS & SSL**: Supported everywhere out-of-the-box.
2. **Zero-Cost & Serverless**: Runs completely on Deno Deploy's or Cloudflare's free tiers (handles hundreds of thousands of daily score uploads).
3. **100% Dreamlo API Match**: A direct drop-in replacement. Simply change your API base URL and keep your existing game scripts!
4. **Developer Dashboard**: A clean, minimalist dark-mode manager to monitor your leaderboards, manually log entries, delete scores, search players, and export reports to CSV.
5. **Private Ownership**: Host your own backend. You own 100% of your player highscore data. No third-party data tracking.

---

## ⚙️ Architecture

```
                       ┌─────────────────────────┐
                       │  Player Client (Game)   │
                       └────────────┬────────────┘
                                    │
                         HTTPS GET  │  (Add/Read Score)
                                    ▼
                       ┌─────────────────────────┐
                       │   FOSSBoard Backend     │ (Deno Deploy / CF Worker)
                       └────────────┬────────────┘
                                    │
                                    │  Persistent Storage
                                    ▼
                       ┌─────────────────────────┐
                       │    KV Store Database    │ (Deno KV / Cloudflare KV)
                       └─────────────────────────┘
                                    ▲
                                    │ Read/Write
                       ┌────────────┴────────────┐
                       │   FOSSBoard Dashboard   │ (Hosted on GitHub Pages)
                       └─────────────────────────┘
```

---

## Step 1: Deploy the Frontend Dashboard (GitHub Pages)

The admin panel runs directly in the browser and connects securely to your serverless backend.

1. **Fork this repository** to your own GitHub account.
2. Go to your repository settings -> **Pages**.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Push any small commit or trigger the workflow manually under the **Actions** tab.
5. Your custom dashboard is now live on `https://[YOUR-USERNAME].github.io/leaderboard`!

---

## Step 2: Deploy the Serverless Backend (Choose One)

Deploy your private API database backend in under a minute for free.

### Option A: Deno Deploy (Recommended - 450k reqs/day)
Deno Deploy runs globally at the edge with zero cold starts and has the zero-config **Deno KV** database active by default.

* **Deploying to Deno Deploy (Cloud)**:
  1. Create a free account on [Deno Deploy](https://deno.com/deploy).
  2. Click **New Project** -> **Playground**.
  3. Copy the entire contents of [backend/deno_backend.js](backend/deno_backend.js).
  4. Paste the code into the Deno Deploy editor, click **Save & Deploy**.
  5. Copy your custom project URL (e.g. `https://my-leaderboard.deno.dev`).
  6. Toggle the **Self-Host Backend** option in your dashboard and paste this URL. Done!

* **Running / Self-Hosting Locally**:
  Deno KV is an unstable Deno CLI feature. We have included a `deno.json` file in the root. You can run the backend locally with the required flags automatically by executing:
  ```bash
  deno task start
  ```

### Option B: Cloudflare Workers (100k reqs/day)
Cloudflare Workers run globally with ultra-low latency and highly optimized Key-Value bindings.

1. Sign up for a free account on [Cloudflare Workers](https://workers.cloudflare.com/).
2. Create a new Worker.
3. Paste the contents of [backend/worker.js](backend/worker.js) into the Worker's script.
4. Go to **Settings** -> **Variables** -> **KV Namespace Bindings** in your worker dashboard.
5. Create and bind a new KV namespace named `LEADERBOARD_KV`.
6. Save and deploy! Paste your worker URL into the dashboard.

---

## API Reference

FOSSBoard uses standard dreamlo path configurations:

### Write Data (Requires Private Key)

* **Add/Update Score**:
  ```http
  GET /lb/[PRIVATE_KEY]/add/[NAME]/[SCORE]/[SECONDS]/[TEXT]
  ```
  *(Note: both `[SECONDS]` and `[TEXT]` are optional parameters).*

* **Delete Score**:
  ```http
  GET /lb/[PRIVATE_KEY]/delete/[NAME]
  ```

* **Clear Leaderboard**:
  ```http
  GET /lb/[PRIVATE_KEY]/clear
  ```

### Read Data (Public OR Private Key)

* **JSON Format**:
  ```http
  GET /lb/[PUBLIC_KEY]/json
  ```

* **Pipe-Delimited Format** (Ideal for easy string splitting):
  ```http
  GET /lb/[PUBLIC_KEY]/pipe
  ```

* **XML Format**:
  ```http
  GET /lb/[PUBLIC_KEY]/xml
  ```

* **Pagination & Limiting**:
  Add `?limit=10` or `?skip=5` to any read request to page scores!
  ```http
  GET /lb/[PUBLIC_KEY]/json?limit=10&skip=20
  ```

---

## Game Integrations

The **Integration Hub** tab in your deployed dashboard automatically generates ready-to-use snippets customized with your keys and endpoint.

Here are quick templates:

### Unity C# (Pipe Parsing)
```csharp
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

public class HighscoreManager : MonoBehaviour {
    private const string ApiUrl = "https://my-leaderboard.deno.dev";
    private const string PrivateKey = "your-private-key";
    private const string PublicKey = "your-public-key";

    public void AddScore(string name, int score) {
        StartCoroutine(SendScore(name, score));
    }

    private IEnumerator SendScore(string name, int score) {
        string url = $"{ApiUrl}/lb/{PrivateKey}/add/{UnityWebRequest.EscapeURL(name)}/{score}";
        using (UnityWebRequest req = UnityWebRequest.Get(url)) {
            yield return req.SendWebRequest();
            if (req.result == UnityWebRequest.Result.Success) Debug.Log("Score submitted!");
        }
    }
}
```

### JavaScript (ES6 Fetch)
```javascript
const API = "https://my-leaderboard.deno.dev";
const PUB_KEY = "your-public-key";

async function fetchScores() {
  const res = await fetch(`${API}/lb/${PUB_KEY}/json`);
  const data = await res.json();
  const entries = data.dreamlo.leaderboard?.entry || [];
  return Array.isArray(entries) ? entries : [entries];
}
```

---

## Theme Customization
The dashboard is styled with modern Zinc parameters. Want to customize the accent colors? Simply tweak the CSS variables inside [index.css](index.css):

```css
:root {
  --primary: #4f46e5;
  --bg-base: #09090b;
  --bg-surface: #18181b;
  --border: #27272a;
}
```

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
