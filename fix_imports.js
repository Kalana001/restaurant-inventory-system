const fs = require('fs');
const path = require('path');

const fixFile = (file) => {
  const filepath = path.join(__dirname, file);
  let content = fs.readFileSync(filepath, 'utf8');
  
  // The error is:
  // import {
  // import { format } from 'date-fns';
  //   Plus, ...
  
  // We want to extract `import { format } from 'date-fns';` and put it at the top,
  // and remove the extra `import { format } from 'date-fns';` inside the other import.
  
  if (content.includes("import {\nimport { format } from 'date-fns';")) {
      content = content.replace("import {\nimport { format } from 'date-fns';", "import {");
      content = "import { format } from 'date-fns';\n" + content;
      fs.writeFileSync(filepath, content);
      console.log("Fixed", file);
  }
};

fixFile('frontend/src/pages/Adjustments.tsx');
fixFile('frontend/src/pages/PurchaseOrders.tsx');
fixFile('frontend/src/pages/GRNs.tsx');
fixFile('frontend/src/pages/Inventory.tsx');
fixFile('frontend/src/pages/Reports.tsx');
