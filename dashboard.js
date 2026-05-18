const DEFAULT_API_BASE = "https://fossboard.deno.dev";

const state = {
  leaderboards: [],
  activeBoard: null,
  scores: [],
  searchQuery: "",
};

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const iconClass = type === "success"
    ? "fa-circle-check"
    : type === "error"
      ? "fa-circle-exclamation"
      : "fa-circle-info";

  toast.innerHTML = `
    <span class="toast-icon"><i class="fa-solid ${iconClass}"></i></span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideIn 0.3s cubic-bezier(0.25, 1, 0.5, 1) reverse forwards";
    toast.addEventListener("animationend", () => toast.remove());
  }, 4500);
}

function copyToClipboard(text, label = "Content") {
  navigator.clipboard.writeText(text).then(
    () => showToast(`${label} copied to clipboard!`, "success"),
    () => showToast(`Failed to copy ${label.toLowerCase()}.`, "error")
  );
}

function copyCodeBlock(elementId) {
  const codeEl = document.getElementById(elementId);
  if (codeEl) {
    copyToClipboard(codeEl.innerText, "Code block");
  }
}

const app = {
  copyToClipboard,
  copyCodeBlock,

  init() {
    this.loadStateFromStorage();
    this.setupNavigation();
    this.setupFormHandlers();
    this.setupTableControls();
    this.setupDocsNavigation();
    this.renderLeaderboardSidebar();

    if (state.leaderboards.length > 0) {
      this.selectLeaderboard(state.leaderboards[0]);
    } else {
      this.updateActiveBoardUI();
    }

    this.updateCodeSnippets();
    showToast("FOSSBoard is initialized!", "info");
  },

  loadStateFromStorage() {
    const stored = localStorage.getItem("fossboard_data") || localStorage.getItem("aetherboard_data");
    if (stored) {
      try {
        state.leaderboards = JSON.parse(stored);
      } catch (e) {
        console.error("Error reading stored leaderboards:", e);
        state.leaderboards = [];
      }
    }
  },

  saveStateToStorage() {
    localStorage.setItem("fossboard_data", JSON.stringify(state.leaderboards));
  },

  setupNavigation() {
    const views = {
      home: { btn: "nav-home-btn", sec: "landing-view" },
      dash: { btn: "nav-dashboard-btn", sec: "dashboard-view" },
      docs: { btn: "nav-docs-btn", sec: "docs-view" }
    };

    const showView = (viewKey) => {
      Object.values(views).forEach(v => {
        document.getElementById(v.btn).classList.remove("active");
        document.getElementById(v.sec).classList.remove("active");
      });

      const active = views[viewKey];
      document.getElementById(active.btn).classList.add("active");
      const section = document.getElementById(active.sec);
      section.classList.add("active");

      this.updateCodeSnippets();
    };

    document.getElementById("nav-home-btn").addEventListener("click", () => showView("home"));
    document.getElementById("nav-dashboard-btn").addEventListener("click", () => showView("dash"));
    document.getElementById("nav-docs-btn").addEventListener("click", () => showView("docs"));

    document.getElementById("logo-link").addEventListener("click", (e) => { e.preventDefault(); showView("home"); });
    document.getElementById("footer-logo-link").addEventListener("click", (e) => { e.preventDefault(); showView("home"); });
    document.getElementById("footer-home").addEventListener("click", (e) => { e.preventDefault(); showView("home"); });
    document.getElementById("footer-dash").addEventListener("click", (e) => { e.preventDefault(); showView("dash"); });
    document.getElementById("footer-docs").addEventListener("click", (e) => { e.preventDefault(); showView("docs"); });

    document.getElementById("scroll-to-create-btn").addEventListener("click", () => {
      document.getElementById("board-name").focus();
      document.getElementById("creation-card-wrapper").scrollIntoView({ behavior: "smooth" });
    });

    document.getElementById("learn-to-host-btn").addEventListener("click", () => {
      showView("docs");
      this.switchDocsSection("docs-self-host");
    });

    document.getElementById("dash-create-redirect-btn").addEventListener("click", () => {
      showView("home");
      document.getElementById("board-name").focus();
    });
  },

  setupFormHandlers() {
    const selfHostCheck = document.getElementById("self-host-toggle");
    const customEndpointGroup = document.getElementById("custom-endpoint-group");

    selfHostCheck.addEventListener("change", () => {
      if (selfHostCheck.checked) {
        customEndpointGroup.style.display = "block";
        document.getElementById("custom-endpoint-url").required = true;
      } else {
        customEndpointGroup.style.display = "none";
        document.getElementById("custom-endpoint-url").required = false;
      }
    });

    const createForm = document.getElementById("create-leaderboard-form");
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = document.getElementById("board-name").value.trim();
      const sort = document.getElementById("board-sort").value;
      const isSelfHosted = selfHostCheck.checked;
      let apiBase = DEFAULT_API_BASE;

      if (isSelfHosted) {
        let customUrl = document.getElementById("custom-endpoint-url").value.trim();
        if (customUrl.endsWith("/")) {
          customUrl = customUrl.slice(0, -1);
        }
        if (customUrl) {
          apiBase = customUrl;
        }
      }

      const submitBtn = document.getElementById("create-submit-btn");
      const submitOriginalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<div class="spinner"></div> Creating...`;

      try {
        const createUrl = `${apiBase}/api/create?name=${encodeURIComponent(name)}&sort=${sort}`;
        const response = await fetch(createUrl);
        if (!response.ok) {
          throw new Error(`Server returned status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          const newBoard = {
            name: data.name,
            privateKey: data.privateKey,
            publicKey: data.publicKey,
            sort: data.sort,
            customUrl: isSelfHosted ? apiBase : null,
          };

          state.leaderboards.push(newBoard);
          this.saveStateToStorage();
          this.renderLeaderboardSidebar();
          this.selectLeaderboard(newBoard);

          createForm.reset();
          customEndpointGroup.style.display = "none";
          selfHostCheck.checked = false;

          showToast("Leaderboard created successfully!", "success");
          document.getElementById("nav-dashboard-btn").click();
        } else {
          throw new Error(data.error || "Unknown server response");
        }
      } catch (err) {
        console.error("Creation error:", err);
        showToast(`Failed to create: ${err.message}`, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = submitOriginalText;
      }
    });

    const adminScoreForm = document.getElementById("admin-score-form");
    adminScoreForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!state.activeBoard) {
        showToast("Please select a leaderboard first", "error");
        return;
      }

      const name = document.getElementById("admin-player-name").value.trim();
      const score = parseInt(document.getElementById("admin-player-score").value, 10);
      const seconds = parseInt(document.getElementById("admin-player-seconds").value, 10) || 0;
      const text = document.getElementById("admin-player-text").value.trim();

      const apiBase = state.activeBoard.customUrl || DEFAULT_API_BASE;
      const submitBtn = document.getElementById("admin-score-submit-btn");
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<div class="spinner"></div> Submitting...`;

      try {
        const addUrl = `${apiBase}/lb/${state.activeBoard.privateKey}/add/${encodeURIComponent(name)}/${score}/${seconds}/${encodeURIComponent(text)}`;
        const response = await fetch(addUrl);
        const resText = await response.text();

        if (response.ok && resText.trim() === "OK") {
          showToast(`Submitted score for ${name}!`, "success");
          adminScoreForm.reset();
          this.fetchScores();
        } else {
          throw new Error(resText || "Server failed to record score.");
        }
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "<span>Submit Entry</span>";
      }
    });
  },

  renderLeaderboardSidebar() {
    const listContainer = document.getElementById("leaderboards-sidebar-list");
    const countBadge = document.getElementById("lb-count-badge");

    countBadge.innerText = state.leaderboards.length;

    if (state.leaderboards.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem 1rem;">
          <p style="font-size: 0.8rem; color: var(--text-muted);">No active boards.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = "";
    state.leaderboards.forEach((board) => {
      const item = document.createElement("div");
      item.className = `lb-item ${state.activeBoard && state.activeBoard.publicKey === board.publicKey ? "selected" : ""}`;

      const hostType = board.customUrl ? "Custom" : "Cloud";

      item.innerHTML = `
        <div class="lb-item-name" title="${board.name}">${board.name}</div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="lb-item-type">${hostType}</span>
          <span class="lb-item-delete" title="Remove board from local view"><i class="fa-solid fa-xmark"></i></span>
        </div>
      `;

      item.addEventListener("click", (e) => {
        if (e.target.closest(".lb-item-delete")) {
          e.stopPropagation();
          this.removeLeaderboard(board);
        } else {
          this.selectLeaderboard(board);
        }
      });

      listContainer.appendChild(item);
    });
  },

  selectLeaderboard(board) {
    state.activeBoard = board;

    const items = document.querySelectorAll(".lb-item");
    items.forEach((item, index) => {
      const b = state.leaderboards[index];
      if (b && b.publicKey === board.publicKey) {
        item.classList.add("selected");
      } else {
        item.classList.remove("selected");
      }
    });

    this.updateActiveBoardUI();
    this.fetchScores();
    this.updateCodeSnippets();
  },

  removeLeaderboard(board) {
    if (confirm(`Remove "${board.name}" from your local dashboard view?\n\nNote: This will not delete the scores on the server database. You can re-add it by using its keys in the future.`)) {
      state.leaderboards = state.leaderboards.filter(b => b.publicKey !== board.publicKey);
      this.saveStateToStorage();
      this.renderLeaderboardSidebar();

      if (state.activeBoard && state.activeBoard.publicKey === board.publicKey) {
        if (state.leaderboards.length > 0) {
          this.selectLeaderboard(state.leaderboards[0]);
        } else {
          state.activeBoard = null;
          this.updateActiveBoardUI();
        }
      }

      showToast("Leaderboard removed from view.", "info");
    }
  },

  updateActiveBoardUI() {
    const noSelectionCard = document.getElementById("dashboard-no-selection");
    const activeHeader = document.getElementById("dashboard-active-header");
    const activeTableCard = document.getElementById("dashboard-active-table-card");
    const adminAddCard = document.getElementById("admin-add-score-card");

    if (!state.activeBoard) {
      noSelectionCard.style.display = "flex";
      activeHeader.style.display = "none";
      activeTableCard.style.display = "none";
      adminAddCard.style.display = "none";
      return;
    }

    noSelectionCard.style.display = "none";
    activeHeader.style.display = "flex";
    activeTableCard.style.display = "block";
    adminAddCard.style.display = "block";

    document.getElementById("active-board-name").innerText = state.activeBoard.name;
    document.getElementById("active-board-sort").innerText =
      state.activeBoard.sort === "asc" ? "Best Time First" : "High Score First";

    document.getElementById("active-board-priv").innerText = state.activeBoard.privateKey;
    document.getElementById("active-board-pub").innerText = state.activeBoard.publicKey;

    const apiBase = state.activeBoard.customUrl || DEFAULT_API_BASE;
    document.getElementById("active-board-endpoint-url").innerText = apiBase;
  },

  async fetchScores() {
    if (!state.activeBoard) return;

    const loader = document.getElementById("table-loader");
    const emptyState = document.getElementById("table-empty-state");
    const tableBody = document.getElementById("scores-table-body");

    loader.style.display = "flex";
    emptyState.style.display = "none";
    tableBody.innerHTML = "";

    const apiBase = state.activeBoard.customUrl || DEFAULT_API_BASE;
    const pubKey = state.activeBoard.publicKey;

    try {
      const readUrl = `${apiBase}/lb/${pubKey}/json`;
      const response = await fetch(readUrl);

      if (!response.ok) {
        throw new Error(`Network response error: ${response.status}`);
      }

      const data = await response.json();
      const leaderboard = data.dreamlo.leaderboard;

      if (!leaderboard) {
        state.scores = [];
        emptyState.style.display = "block";
        return;
      }

      const rawEntries = leaderboard.entry;
      if (!rawEntries) {
        state.scores = [];
        emptyState.style.display = "block";
        return;
      }

      let entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

      state.scores = entries.map(e => ({
        name: e.name,
        score: parseInt(e.score, 10),
        seconds: parseInt(e.seconds, 10),
        text: e.text,
        date: e.date
      }));

      this.renderScoresTable();
    } catch (err) {
      console.error("Failed loading scores:", err);
      showToast(`Error fetching scores: ${err.message}`, "error");
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); font-weight: 500;">Failed to connect to API backend.</td></tr>`;
    } finally {
      loader.style.display = "none";
    }
  },

  renderScoresTable() {
    const tableBody = document.getElementById("scores-table-body");
    const emptyState = document.getElementById("table-empty-state");

    tableBody.innerHTML = "";

    const filtered = state.scores.filter(score =>
      score.name.toLowerCase().includes(state.searchQuery.toLowerCase())
    );

    if (filtered.length === 0) {
      emptyState.style.display = "block";
      return;
    }

    emptyState.style.display = "none";

    filtered.forEach((entry, idx) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td class="rank-col">${idx + 1}</td>
        <td class="username-col">${entry.name}</td>
        <td class="score-col">${entry.score.toLocaleString()}</td>
        <td class="seconds-col">${entry.seconds}s</td>
        <td class="text-col" title="${entry.text}">${entry.text || '<span style="color:var(--text-muted); font-style:italic;">None</span>'}</td>
        <td class="date-col">${entry.date}</td>
        <td class="action-col">
          <button class="action-row-btn" title="Delete score" onclick="app.deleteScore('${entry.name}')">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </td>
      `;
      tableBody.appendChild(row);
    });
  },

  async deleteScore(username) {
    if (!state.activeBoard) return;

    if (confirm(`Are you sure you want to delete the score for "${username}"?`)) {
      const apiBase = state.activeBoard.customUrl || DEFAULT_API_BASE;
      const privKey = state.activeBoard.privateKey;

      try {
        const deleteUrl = `${apiBase}/lb/${privKey}/delete/${encodeURIComponent(username)}`;
        const response = await fetch(deleteUrl);
        const resText = await response.text();

        if (response.ok && resText.trim() === "OK") {
          showToast(`Deleted score for ${username}.`, "success");
          this.fetchScores();
        } else {
          throw new Error(resText || "Server error occurred during deletion.");
        }
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  },

  async clearBoard() {
    if (!state.activeBoard) return;

    if (confirm("WARNING: Are you absolutely sure you want to delete ALL scores? This action is permanent and cannot be undone.")) {
      const apiBase = state.activeBoard.customUrl || DEFAULT_API_BASE;
      const privKey = state.activeBoard.privateKey;

      const wipeBtn = document.getElementById("btn-clear-board");
      const originalText = wipeBtn.innerHTML;
      wipeBtn.disabled = true;
      wipeBtn.innerHTML = `<div class="spinner"></div> Wiping...`;

      try {
        const clearUrl = `${apiBase}/lb/${privKey}/clear`;
        const response = await fetch(clearUrl);
        const resText = await response.text();

        if (response.ok && resText.trim() === "OK") {
          showToast("Leaderboard wiped clean!", "success");
          this.fetchScores();
        } else {
          throw new Error(resText || "Server error occurred during board clear.");
        }
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        wipeBtn.disabled = false;
        wipeBtn.innerHTML = originalText;
      }
    }
  },

  exportCSV() {
    if (state.scores.length === 0) {
      showToast("No scores to export!", "error");
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Rank,Username,Score,Seconds,Text,Date Entered\n";

    state.scores.forEach((entry, idx) => {
      const textVal = (entry.text || "").replaceAll('"', '""');
      const row = `${idx + 1},"${entry.name}",${entry.score},${entry.seconds},"${textVal}","${entry.date}"`;
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);

    const fileName = `${state.activeBoard.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_leaderboard.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV exported successfully!", "success");
  },

  setupTableControls() {
    const searchInput = document.getElementById("table-search-input");
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      this.renderScoresTable();
    });

    document.getElementById("btn-refresh-scores").addEventListener("click", () => {
      this.fetchScores();
      showToast("Refreshed scores!", "success");
    });

    document.getElementById("btn-clear-board").addEventListener("click", () => {
      this.clearBoard();
    });

    document.getElementById("btn-export-csv").addEventListener("click", () => {
      this.exportCSV();
    });
  },

  setupDocsNavigation() {
    const navButtons = document.querySelectorAll(".docs-nav-btn");

    navButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        navButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const targetId = btn.getAttribute("data-section");
        this.switchDocsSection(targetId);
      });
    });
  },

  switchDocsSection(sectionId) {
    const sections = document.querySelectorAll(".docs-section");
    sections.forEach(sec => {
      if (sec.id === sectionId) {
        sec.classList.add("active");
      } else {
        sec.classList.remove("active");
      }
    });

    document.querySelector(".docs-content").scrollIntoView({ behavior: "smooth" });
  },

  updateCodeSnippets() {
    const active = state.activeBoard;

    const apiUrl = active ? (active.customUrl || DEFAULT_API_BASE) : DEFAULT_API_BASE;
    const privKey = active ? active.privateKey : "[YOUR-PRIVATE-KEY]";
    const pubKey = active ? active.publicKey : "[YOUR-PUBLIC-KEY]";

    document.getElementById("doc-endpoint-add").innerText = `${apiUrl}/lb/${privKey}/add/[NAME]/[SCORE]/[SECONDS]/[TEXT]`;
    document.getElementById("doc-endpoint-read").innerText = `${apiUrl}/lb/${pubKey}/json`;
    document.getElementById("doc-endpoint-delete").innerText = `${apiUrl}/lb/${privKey}/delete/[NAME]`;
    document.getElementById("doc-endpoint-clear").innerText = `${apiUrl}/lb/${privKey}/clear`;

    const templates = {
      "code-js-block": `
const API_URL = "API_URL_PLACEHOLDER";
const PRIVATE_KEY = "PRIVATE_KEY_PLACEHOLDER";
const PUBLIC_KEY = "PUBLIC_KEY_PLACEHOLDER";

async function submitScore(playerName, score, seconds = 0, text = "") {
  try {
    const url = \`\${API_URL}/lb/\${PRIVATE_KEY}/add/\${encodeURIComponent(playerName)}/\${score}/\${seconds}/\${encodeURIComponent(text)}\`;
    const response = await fetch(url);
    const result = await response.text();
    return result === "OK";
  } catch (error) {
    console.error("Failed to submit score:", error);
    return false;
  }
}

async function getScores() {
  try {
    const response = await fetch(\`\${API_URL}/lb/\${PUBLIC_KEY}/json\`);
    const data = await response.json();
    const leaderboard = data.dreamlo.leaderboard;
    if (!leaderboard) return [];
    const entries = leaderboard.entry;
    if (!entries) return [];
    return Array.isArray(entries) ? entries : [entries];
  } catch (error) {
    console.error("Failed to load scores:", error);
    return [];
  }
}`,

      "code-unity-block": `using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

public class FOSSBoardLeaderboard : MonoBehaviour
{
    private const string ApiUrl = "API_URL_PLACEHOLDER";
    private const string PrivateKey = "PRIVATE_KEY_PLACEHOLDER";
    private const string PublicKey = "PUBLIC_KEY_PLACEHOLDER";

    public void AddScore(string playerName, int score, int seconds = 0, string extraText = "")
    {
        StartCoroutine(AddScoreCoroutine(playerName, score, seconds, extraText));
    }

    private IEnumerator AddScoreCoroutine(string name, int score, int seconds, string text)
    {
        string encodedName = UnityWebRequest.EscapeURL(name);
        string encodedText = UnityWebRequest.EscapeURL(text);
        string url = $"{ApiUrl}/lb/{PrivateKey}/add/{encodedName}/{score}/{seconds}/{encodedText}";

        using (UnityWebRequest webRequest = UnityWebRequest.Get(url))
        {
            yield return webRequest.SendWebRequest();
            if (webRequest.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError("Error adding highscore: " + webRequest.error);
            }
        }
    }

    public void LoadScores()
    {
        StartCoroutine(LoadScoresCoroutine());
    }

    private IEnumerator LoadScoresCoroutine()
    {
        string url = $"{ApiUrl}/lb/{PublicKey}/pipe";

        using (UnityWebRequest webRequest = UnityWebRequest.Get(url))
        {
            yield return webRequest.SendWebRequest();
            if (webRequest.result == UnityWebRequest.Result.Success)
            {
                ParsePipeScores(webRequest.downloadHandler.text);
            }
        }
    }

    private void ParsePipeScores(string raw)
    {
        if (string.IsNullOrEmpty(raw)) return;
        string[] rows = raw.Split('\\n');
        foreach (string row in rows)
        {
            if (string.IsNullOrEmpty(row)) continue;
            string[] cols = row.Split('|');
            string username = cols[0];
            int score = int.Parse(cols[1]);
            int seconds = int.Parse(cols[2]);
            string text = cols[3];
            string date = cols[4];
            
            Debug.Log($"Player: {username} - Score: {score} - Time: {seconds}s ({text})");
        }
    }
}`,

      "code-godot-block": `extends Node

const API_URL = "API_URL_PLACEHOLDER"
const PRIVATE_KEY = "PRIVATE_KEY_PLACEHOLDER"
const PUBLIC_KEY = "PUBLIC_KEY_PLACEHOLDER"

func submit_score(player_name: String, score: int, seconds: int = 0, extra_text: String = ""):
	var http_client = HTTPRequest.new()
	add_child(http_client)
	
	var name_escaped = player_name.uri_encode()
	var text_escaped = extra_text.uri_encode()
	var url = "%s/lb/%s/add/%s/%d/%d/%s" % [API_URL, PRIVATE_KEY, name_escaped, score, seconds, text_escaped]
	
	http_client.request_completed.connect(func(result, response_code, headers, body):
		http_client.queue_free()
	)
	
	http_client.request(url)

func get_leaderboard():
	var http_client = HTTPRequest.new()
	add_child(http_client)
	
	var url = "%s/lb/%s/json" % [API_URL, PUBLIC_KEY]
	
	http_client.request_completed.connect(func(result, response_code, headers, body):
		if response_code == 200:
			var json = JSON.new()
			if json.parse(body.get_string_from_utf8()) == OK:
				var data = json.get_data()
				var leaderboard = data.get("dreamlo", {}).get("leaderboard", null)
				if leaderboard:
					var entries = leaderboard.get("entry", [])
					if typeof(entries) == TYPE_DICTIONARY:
						entries = [entries]
					print("Loaded scores: ", entries)
		http_client.queue_free()
	)
	
	http_client.request(url)`,

      "code-python-block": `import requests
import urllib.parse

API_URL = "API_URL_PLACEHOLDER"
PRIVATE_KEY = "PRIVATE_KEY_PLACEHOLDER"
PUBLIC_KEY = "PUBLIC_KEY_PLACEHOLDER"

def add_score(player_name, score, seconds=0, text=""):
    name_encoded = urllib.parse.quote(player_name)
    text_encoded = urllib.parse.quote(text)
    url = f"{API_URL}/lb/{PRIVATE_KEY}/add/{name_encoded}/{score}/{seconds}/{text_encoded}"
    
    response = requests.get(url)
    return response.status_code == 200 and response.text == "OK"

def get_scores():
    url = f"{API_URL}/lb/{PUBLIC_KEY}/json"
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        leaderboard = data.get("dreamlo", {}).get("leaderboard", None)
        if not leaderboard:
            return []
            
        entries = leaderboard.get("entry", [])
        if isinstance(entries, dict):
            return [entries]
        return entries
    return []`,

      "code-unreal-block": `// Add to Build.cs: PublicDependencyModuleNames.AddRange(new string[] { "HTTP", "Json", "JsonUtilities" });

#include "Http.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"

FString ApiUrl = TEXT("API_URL_PLACEHOLDER");
FString PrivateKey = TEXT("PRIVATE_KEY_PLACEHOLDER");
FString PublicKey = TEXT("PUBLIC_KEY_PLACEHOLDER");

void SubmitHighscore(FString PlayerName, int32 Score, int32 Seconds, FString ExtraText)
{
    FString EncodedName = FGenericPlatformHttp::UrlEncode(PlayerName);
    FString EncodedText = FGenericPlatformHttp::UrlEncode(ExtraText);
    FString RequestUrl = FString::Printf(TEXT("%s/lb/%s/add/%s/%d/%d/%s"), *ApiUrl, *PrivateKey, *EncodedName, Score, Seconds, *EncodedText);

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetVerb("GET");
    Request->SetURL(RequestUrl);
    Request->OnProcessRequestComplete().BindLambda([](FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
    {
        if (bSuccess && Response->GetResponseCode() == 200 && Response->GetContentAsString() == "OK")
        {
            UE_LOG(LogTemp, Log, TEXT("Highscore recorded successfully!"));
        }
    });
    Request->ProcessRequest();
}`
    };

    Object.entries(templates).forEach(([id, codeStr]) => {
      const container = document.getElementById(id);
      if (container) {
        const processed = codeStr
          .replaceAll("API_URL_PLACEHOLDER", apiUrl)
          .replaceAll("PRIVATE_KEY_PLACEHOLDER", privKey)
          .replaceAll("PUBLIC_KEY_PLACEHOLDER", pubKey);
        container.innerText = processed;
      }
    });
  }
};

window.addEventListener("DOMContentLoaded", () => {
  app.init();
});

window.app = app;
