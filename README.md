# 🌐 Mahesh Gorla — Network Engineer Portfolio

[![Live Site](https://img.shields.io/badge/Live-Demo-00f0ff?style=for-the-badge&logo=github&logoColor=white)](https://gorlamaheshkumar.github.io/Portfolio/)
[![Three.js](https://img.shields.io/badge/Three.js-r128-black?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

An interactive, 3D NOC (Network Operations Center) themed personal portfolio built with **pure vanilla JavaScript** and **Three.js**. Designed with a high-tech terminal aesthetic inspired by routing topology, real-time packet telemetry, and network operations.

🔗 **Live Website:** [https://gorlamaheshkumar.github.io/Portfolio/](https://gorlamaheshkumar.github.io/Portfolio/)

---

## ⚡ Features

- **Interactive 3D Network Lattice (WebGL)**: Custom Three.js particle and line shaders representing interconnected network nodes with mouse-follow tilt, depth fog, and packet flow animations.
- **Dynamic Real-Time Uptime & Experience Counter**: Automatically calculates live tenure and NOC node uptime based on joining date, updating seamlessly on every page visit with smooth count-up animations.
- **NOC Terminal Boot Preloader**: Cyberpunk-style handshake simulation with lightning effects, OSPF adjacency verification, and link initialization.
- **Topology Map (Node 03)**: Categorized skill clusters highlighting Networking (VLAN, Subnetting, TCP/IP, DNS, DHCP, VPN, SD-WAN), Monitoring Tools (LogicMonitor, LiveNX, Wireshark), and Cloud/Automation.
- **Projects Carousel (Node 04)**: Interactive 3-up coverflow-style carousel showcasing builds, including *PPT Automation (Cognizant Vibe Coding)* and *Skin Cancer Detection*.
- **Zero Framework Overhead & Self-Hosted**: Built with zero external framework dependencies or CDNs for maximum performance, privacy, and offline reliability.
- **Accessibility & Performance Focused**: Built-in support for `prefers-reduced-motion`, touch/mobile interaction fallbacks, and GPU-efficient rendering.

---

## 📂 Project Structure

```text
Portfolio/
├── index.html          # Core semantic HTML5 layout & section nodes
├── main.js             # Three.js scene, WebGL shaders, DOM animations & auto-updater
├── style.css           # Glassmorphism dark-theme styling, HUD components, and animations
├── three.min.js        # Three.js (r128) library
├── Resume.pdf          # Professional résumé
├── fonts.css           # Local font-face declarations
├── fonts/              # Self-hosted WOFF2 fonts (Inter, Space Grotesk, JetBrains Mono)
└── README.md           # Project documentation
```

---

## 🚀 Getting Started Locally

No complex build tools or package managers needed. You can run the portfolio locally using any static web server:

### Option 1: Python (Recommended)
```bash
# Python 3
python -m http.server 8000
```
Then navigate to `http://localhost:8000` in your web browser.

### Option 2: VS Code Live Server
1. Open the project folder in VS Code.
2. Right-click `index.html` and select **"Open with Live Server"**.

---

## ⚙️ Configuration & Customization

### Dynamic Experience & Uptime
The experience counter and hero uptime are dynamically computed in `main.js`. To update your start date, modify `COGNIZANT_START_DATE` in `main.js`:

```javascript
/* Cognizant start date: March 2025 (month index 2).
   Auto-calculates elapsed months and formats 'Xy Ym' / 'Xmo' dynamically. */
var COGNIZANT_START_DATE = new Date(2025, 2, 1);
```

---

## 👨‍💻 About Me

**Mahesh Gorla**  
*Programme Analyst · Global Network Services at Cognizant*  
- 💼 Focus: Network Monitoring, Troubleshooting, Incident Management, and Automation.
- 🎓 Education: B.E. in Computer Science & Engineering (RMK College of Engineering and Technology, Chennai).
- 🌐 GitHub: [@gorlamaheshkumar](https://github.com/gorlamaheshkumar)
