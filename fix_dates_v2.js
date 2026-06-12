const fs = require('fs');
const path = require('path');

const filesToFix = [
  'frontend/src/pages/Adjustments.tsx',
  'frontend/src/pages/GRNs.tsx',
  'frontend/src/pages/Inventory.tsx',
  'frontend/src/pages/PurchaseOrders.tsx',
  'frontend/src/pages/Reports.tsx'
];

filesToFix.forEach(file => {
  const filepath = path.join(__dirname, file);
  let content = fs.readFileSync(filepath, 'utf8');
  
  if (content.includes("new Date().toISOString().split('T')[0]")) {
    console.log("Fixing", filepath);
    
    // Add import statement at the beginning of the file, right after the last import
    if (!content.includes("from 'date-fns'")) {
       const lines = content.split('\n');
       let lastImportIndex = -1;
       for (let i = 0; i < lines.length; i++) {
         if (lines[i].startsWith('import ')) {
           lastImportIndex = i;
         }
       }
       
       if (lastImportIndex !== -1) {
         lines.splice(lastImportIndex + 1, 0, "import { format } from 'date-fns';");
       } else {
         lines.unshift("import { format } from 'date-fns';");
       }
       content = lines.join('\n');
    }

    content = content.replace(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/g, "format(new Date(), 'yyyy-MM-dd')");
    fs.writeFileSync(filepath, content);
  }
});
