const fs = require('fs');
const path = require('path');

const walk = (dir, callback) => {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      walk(filepath, callback);
    } else if (filepath.endsWith('.tsx') || filepath.endsWith('.ts')) {
      callback(filepath);
    }
  });
};

walk(path.join(__dirname, 'frontend/src'), (filepath) => {
  let content = fs.readFileSync(filepath, 'utf8');
  if (content.includes("new Date().toISOString().split('T')[0]")) {
    console.log("Fixing", filepath);
    
    // Add import if needed
    if (!content.includes("from 'date-fns'") && !content.includes('from "date-fns"')) {
       // Insert import at the top after other imports
       const lines = content.split('\n');
       let lastImportIndex = -1;
       for (let i = 0; i < lines.length; i++) {
         if (lines[i].startsWith('import')) {
           lastImportIndex = i;
         }
       }
       if (lastImportIndex !== -1) {
         lines.splice(lastImportIndex + 1, 0, "import { format } from 'date-fns';");
       } else {
         lines.unshift("import { format } from 'date-fns';");
       }
       content = lines.join('\n');
    } else if (content.includes("from 'date-fns'") && !content.includes("format")) {
       content = content.replace(/import\s+{([^}]+)}\s+from\s+'date-fns';/g, (match, p1) => {
          return `import { ${p1.trim()}, format } from 'date-fns';`;
       });
    }

    content = content.replace(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/g, "format(new Date(), 'yyyy-MM-dd')");
    fs.writeFileSync(filepath, content);
  }
});
