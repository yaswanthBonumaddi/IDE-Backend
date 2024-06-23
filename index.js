const http = require("http");
const express = require("express");
const fs = require("fs/promises");
const { Server: SocketServer } = require("socket.io");
const path = require("path");
const cors = require("cors");
const os = require("os");
const pty = require("node-pty");
const { exec } = require("child_process"); // Import exec from child_process module

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

var shell = os.platform() === "win32" ? "powershell.exe" : "bash";
const cwd = path.resolve(__dirname, "user");
var ptyProcess = pty.spawn(shell, [], {
  name: "xterm-color",
  cols: 80,
  rows: 30,
  cwd: cwd,
  env: process.env,
});

ptyProcess.onData((data) => {
  io.emit("terminal:data", data);
});

io.on("connection", (socket) => {
  console.log(`Socket connected`, socket.id);

  socket.emit("file:refresh");

  socket.on("file:change", async ({ path, content }) => {
    await fs.writeFile(`./user${path}`, content);
  });

  socket.on("terminal:write", (data) => {
    ptyProcess.write(data);
  });
});

app.get("/files", async (req, res) => {
  try {
    const fileTree = await generateFileTree("./user");
    return res.json({ tree: fileTree });
  } catch (error) {
    console.error("Error generating file tree:", error);
    res.status(500).json({ error: "Failed to generate file tree" });
  }
});

async function generateFileTree(directory) {
  const tree = {};

  async function buildTree(currentDir, currentTree) {
    const files = await fs.readdir(currentDir);

    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        currentTree[file] = {};
        await buildTree(filePath, currentTree[file]);
      } else {
        currentTree[file] = null;
      }
    }
  }

  await buildTree(directory, tree);
  return tree;
}

app.get("/files/content", async (req, res) => {
  const path = req.query.path;
  try {
    const content = await fs.readFile(`./user${path}`, "utf-8");
    return res.json({ content });
  } catch (error) {
    console.error("Error reading file:", error);
    res.status(500).json({ error: "Failed to read file" });
  }
});

async function saveFileUpdate(filePath, content) {
  const fullPath = path.join(__dirname, "user", filePath);
  await fs.writeFile(fullPath, content, "utf-8");
}

app.post("/files/save", async (req, res) => {
  const { path, content } = req.body;
  try {
    await saveFileUpdate(path, content);
    res.status(200).json({ message: "File updated successfully" });
  } catch (error) {
    console.error("Error saving file:", error);
    res.status(500).json({ error: "Failed to update file" });
  }
});

app.post('/load-project', async (req, res) => {
  const { gitUrl } = req.body;
  const parts = gitUrl.split('/');
  let lastValue = parts[parts.length - 1];
  
  if (lastValue.endsWith('.git')) {
    lastValue = lastValue.slice(0, -4); // Remove the last 4 characters (.git)
  }

  const projectName = `user/${lastValue}`; // Customize this path as needed

  try {
    // Check if the project directory already exists
    const projectPath = path.resolve(__dirname, projectName);
    const projectExists = await fs.stat(projectPath).then(() => true).catch(() => false);

    // If project exists, send success response without cloning
    if (projectExists) {
      res.status(200).json({ message: 'Project directory already exists', projectName });
      return;
    }

    // Create the project directory
    await fs.mkdir(projectPath, { recursive: true });

    // Clone Git repository
    exec(`git clone ${gitUrl} ${projectPath}`, async (err, stdout, stderr) => {
      if (err) {
        console.error('Error cloning Git repository:', err);
        res.status(500).json({ error: 'Failed to load project' });
        return;
      }

      console.log('Git clone output:', stdout);
      console.error('Git clone errors:', stderr);

      res.status(200).json({ message: 'Project loaded successfully', projectName });
    });
  } catch (error) {
    console.error('Error loading project:', error);
    res.status(500).json({ error: 'Failed to load project' });
  }
});


server.listen(8888, () => console.log(`Server running on port 8888`));
