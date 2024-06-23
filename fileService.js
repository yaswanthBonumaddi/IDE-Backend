const fs = require('fs/promises');
const path = require('path');

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

async function saveFileUpdate(filePath, content) {
    const fullPath = path.join(__dirname, 'user', filePath);
    await fs.writeFile(fullPath, content, 'utf-8');
}

module.exports = {
    generateFileTree,
    saveFileUpdate,
};
