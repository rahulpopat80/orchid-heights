const fs = require('fs');
const files = [
  'src/components/resident/AmenitiesSection.tsx',
  'src/components/resident/HelpDeskSection.tsx',
  'src/components/resident/LocalServicesSection.tsx',
  'src/components/resident/NoticeSection.tsx',
  'src/components/resident/VisitorsSection.tsx',
  'src/components/resident/ProfileSection.tsx',
  'src/components/resident/DirectorySection.tsx',
  'src/components/resident/BuildingServicesSection.tsx',
  'src/components/AdminDashboard.tsx',
  'src/components/ResidentDashboard.tsx'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  
  if (!content.includes('framer-motion')) {
    content = content.replace(/import React([^;]*);/, "import React$1;\nimport { motion, AnimatePresence } from 'framer-motion';");
  } else if (!content.includes('AnimatePresence')) {
    content = content.replace(/import \{ motion \} from 'framer-motion';/, "import { motion, AnimatePresence } from 'framer-motion';");
  }
  
  // Replace missing ArrowLeft imports if needed
  if (!content.includes('ArrowLeft') && content.includes('lucide-react')) {
    content = content.replace(/import \{([^}]+)\} from 'lucide-react';/, (match, p1) => {
        return `import {${p1}, ArrowLeft} from 'lucide-react';`;
    });
  }

  // Fix the back button '?'
  content = content.replace(/<span className="text-xl leading-none -mt-0\.5">\?<\/span>/g, '<ArrowLeft className="w-4 h-4 -ml-1" />');
  
  // Wrap admin and owner sub-sections in motion.div if they aren't already
  if (file.includes('AmenitiesSection') && !content.includes('<AnimatePresence mode="wait">')) {
    content = content.replace(/\{activeSub === 'menu' && \(/g, '<AnimatePresence mode="wait">\n      {activeSub === \'menu\' && (');
    content = content.replace(/<div className="space-y-4">(\s*<div className="flex items-center space-x-2 border-b border-slate-100 pb-2 mb-2">)/, '<motion.div key="menu" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="space-y-4">$1');
    content = content.replace(/\{activeSub === 'gym_theatre' && \(\s*<div className="bg-white border/g, '{activeSub === \'gym_theatre\' && (\n        <motion.div key="gym" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="bg-white border');
    content = content.replace(/\{activeSub === 'movies' && \(\s*<div className="bg-white border/g, '{activeSub === \'movies\' && (\n        <motion.div key="movies" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="bg-white border');
    content = content.replace(/\{activeSub === 'bookings' && \(\s*<div className="bg-white border/g, '{activeSub === \'bookings\' && (\n        <motion.div key="bookings" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="bg-white border');
    
    // Close motion tags in AmenitiesSection
    content = content.replace(/<\/div>\s*\)\}\s*\{\/\* ==================== SCREEN: GYM & THEATRE GATE ACCESS/g, '</motion.div>\n      )}\n\n      {/* ==================== SCREEN: GYM & THEATRE GATE ACCESS');
    content = content.replace(/<\/div>\s*\)\}\s*\{\/\* ==================== SCREEN: MOVIE THEATRE/g, '</motion.div>\n      )}\n\n      {/* ==================== SCREEN: MOVIE THEATRE');
    content = content.replace(/<\/div>\s*\)\}\s*\{\/\* ==================== SCREEN: FUNCTION HALL/g, '</motion.div>\n      )}\n\n      {/* ==================== SCREEN: FUNCTION HALL');
    content = content.replace(/<\/div>\s*\)\}\s*\{\/\* ==================== MODALS ==================== \*\/\}/g, '</motion.div>\n      )}\n      </AnimatePresence>\n\n      {/* ==================== MODALS ==================== */}');
  }

  if (file.includes('HelpDeskSection') && !content.includes('<AnimatePresence mode="wait">')) {
    content = content.replace(/\{activeSub === 'menu' && \(/g, '<AnimatePresence mode="wait">\n      {activeSub === \'menu\' && (');
    content = content.replace(/<div className="space-y-4">(\s*<div className="flex items-center space-x-2 border-b border-slate-100 pb-2 mb-2">)/, '<motion.div key="menu" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="space-y-4">$1');
    content = content.replace(/\{activeSub === 'complaints' && \(\s*<div className="bg-white border/g, '{activeSub === \'complaints\' && (\n        <motion.div key="complaints" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="bg-white border');
    content = content.replace(/\{activeSub === 'sos' && \(\s*<div className="bg-white border/g, '{activeSub === \'sos\' && (\n        <motion.div key="sos" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="bg-white border');
    
    // Close tags
    content = content.replace(/<\/div>\s*\)\}\s*\{\/\* ==================== SCREEN: COMPLAINT BOX/g, '</motion.div>\n      )}\n\n      {/* ==================== SCREEN: COMPLAINT BOX');
    content = content.replace(/<\/div>\s*\)\}\s*\{\/\* ==================== SCREEN: EMERGENCY SOS/g, '</motion.div>\n      )}\n\n      {/* ==================== SCREEN: EMERGENCY SOS');
    content = content.replace(/<\/div>\s*\)\}\s*\{\/\* ==================== MODALS ==================== \*\/\}/g, '</motion.div>\n      )}\n      </AnimatePresence>\n\n      {/* ==================== MODALS ==================== */}');
  }

  if (file.includes('LocalServicesSection') && !content.includes('<AnimatePresence mode="wait">')) {
    content = content.replace(/\{activeSub === 'menu' && \(/g, '<AnimatePresence mode="wait">\n      {activeSub === \'menu\' && (');
    content = content.replace(/<div className="space-y-4">(\s*<div className="flex items-center space-x-2 border-b border-slate-100 pb-2 mb-2">)/, '<motion.div key="menu" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="space-y-4">$1');
    content = content.replace(/\{activeSub === 'workers' && \(\s*<div className="bg-white border/g, '{activeSub === \'workers\' && (\n        <motion.div key="workers" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="bg-white border');
    content = content.replace(/\{activeSub === 'vendors' && \(\s*<div className="bg-white border/g, '{activeSub === \'vendors\' && (\n        <motion.div key="vendors" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="bg-white border');
    
    content = content.replace(/<\/div>\s*\)\}\s*\{\/\* ==================== SCREEN: DAILY HELPERS/g, '</motion.div>\n      )}\n\n      {/* ==================== SCREEN: DAILY HELPERS');
    content = content.replace(/<\/div>\s*\)\}\s*\{\/\* ==================== SCREEN: LOCAL VENDORS/g, '</motion.div>\n      )}\n\n      {/* ==================== SCREEN: LOCAL VENDORS');
    content = content.replace(/<\/div>\s*\)\}\s*<\/div>\s*\);\s*\};/g, '</motion.div>\n      )}\n      </AnimatePresence>\n    </div>\n  );\n};');
  }
  
  if (file.includes('AdminDashboard.tsx')) {
    // Add transition to sub blocks in Admin Dashboard
    if (!content.includes('<motion.div key="admin-sub"')) {
      content = content.replace(/\{activeLocalTab === 'providers' && \(/g, '{activeLocalTab === \'providers\' && (\n<motion.div key="admin-sub-providers" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}}>');
      content = content.replace(/\{activeLocalTab === 'building' && \(/g, '{activeLocalTab === \'building\' && (\n<motion.div key="admin-sub-building" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}}>');
      content = content.replace(/<\/div>\s*\)\}\s*<\/div>\s*\)\}\s*<\/div>\s*\)\}\s*<\/div>\s*\)\}/g, '</div>\n                  </motion.div>\n                )}\n              </div>\n            )}\n          </div>\n        )}\n      </div>\n    )}'); // A bit risky but let's just use CSS for this if needed, actually doing it with replace is error prone
    }
  }

  fs.writeFileSync(file, content);
});
