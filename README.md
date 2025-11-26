# Novel Hider & Tracker Extension

An essential browser extension designed to help track novel progress and filter out content on **[Insert Website Name Here, e.g., twkan.com]**.

This tool adds categorization buttons ("Reading", "Hiatus", "Disliked", "Completed") directly onto novel listings and chapter pages, allowing for organization and list cleaning.

---

## ✨ Features

* **List Hiding:** Automatically hides novels categorized as "Disliked," "Hiatus," or "Completed" from the main novel lists.
* **Progress Tracking:** On chapter pages, easily mark the current chapter as "Reading" or "Hiatus" to save your exact position.
* **Clear UI:** Integration of highly visible, color-coded buttons directly into the site's navigation bars.

---

## 🚀 Installation (Developer Mode)

Since this is a custom browser extension, you must install it manually using your browser's developer mode.

1.  **Download the Code:** Clone this repository or download the source code ZIP file.
    ```bash
    git clone [https://github.com/YourUsername/novel-tracker-extension.git](https://github.com/YourUsername/novel-tracker-extension.git)
    ```
2.  **Open Extension Management:**
    * **Chrome/Brave/Edge:** Go to `chrome://extensions`
    * **Firefox:** Go to `about:addons`, then click the settings gear and select "Debug Add-ons."
3.  **Enable Developer Mode:** Ensure the **"Developer mode"** toggle (usually in the top right corner) is switched **ON**.
4.  **Load the Extension:** Click the **"Load unpacked"** or **"Load temporary Add-on"** button and select the root folder of this repository (`novel-tracker-extension/`).

The extension should now be active on the configured website.

---

## 📁 Repository Structure

| File | Purpose |
| :--- | :--- |
| `manifest.json` | Configuration file detailing the extension's name, version, and which scripts/CSS files to load. |
| `content.js` | The main JavaScript logic responsible for detecting the page type, adding buttons, and managing storage/hiding. |
| `style.css` | Custom CSS using `!important` flags to force button colors, padding, and layout overrides against the host site's styles. |

---

## 📖 Console Commands (Debugging)

For debugging and manual cleanup, you can use the following commands in the browser's console (F12) while on the target site:

| Command | Description |
| :--- | :--- |
| `NovelHider.list()` | Lists all novels currently stored in the extension's database. |
| `NovelHider.clearAll()` | **Warning:** Clears ALL saved novel categories and progress. |
| `NovelHider.remove('url')` | Removes a specific novel entry from storage using its full book URL. |

---

## 🤝 Contributing

(If you plan to allow others to contribute):
1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.
