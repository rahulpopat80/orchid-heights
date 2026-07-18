import jsPDF from 'jspdf';
import { Visitor } from '../types';

const sanitizeText = (str: string) => {
  if (!str) return '';
  const clean = str.replace(/[^\x00-\x7F]/g, '').trim();
  return clean || '[Local Name]';
};

export const generateVisitorPDF = (logs: Visitor[], title: string, subtitle: string, isAdmin: boolean = false) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const logsPerPage = 4;
  
  const cardHeight = 60;
  const cardSpacing = 5;

  let currentLogIndex = 0;
  
  while (currentLogIndex < logs.length) {
    if (currentLogIndex > 0) {
      doc.addPage();
    }

    // Header
    doc.setFillColor(79, 70, 229); // Indigo 600
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ORCHID HEIGHTS GATEKEEPER', pageWidth / 2, 12, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(title, pageWidth / 2, 18, { align: 'center' });
    
    // Subtitle
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.setFontSize(9);
    doc.text(`${subtitle} | Generated: ${new Date().toLocaleString('en-IN')}`, margin, 32);
    
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.line(margin, 35, pageWidth - margin, 35);

    let startY = 40;

    for (let i = 0; i < logsPerPage && currentLogIndex < logs.length; i++) {
      const log = logs[currentLogIndex];
      
      // Draw Card Background
      doc.setFillColor(248, 250, 252); // Slate 50
      doc.setDrawColor(203, 213, 225); // Slate 300
      doc.roundedRect(margin, startY, contentWidth, cardHeight, 3, 3, 'FD');

      // Draw Photo
      const photoSize = 50;
      const photoX = margin + 5;
      const photoY = startY + 5;
      
      // Add a border for photo
      doc.setDrawColor(226, 232, 240);
      doc.rect(photoX, photoY, photoSize, photoSize);
      
      try {
        if (log.photoUrl && log.photoUrl.startsWith('data:image')) {
          const imgProps = doc.getImageProperties(log.photoUrl);
          // Scale to fit while maintaining aspect ratio
          const scale = Math.min(photoSize / imgProps.width, photoSize / imgProps.height);
          const drawW = imgProps.width * scale;
          const drawH = imgProps.height * scale;
          const drawX = photoX + (photoSize - drawW) / 2;
          const drawY = photoY + (photoSize - drawH) / 2;
          doc.addImage(log.photoUrl, imgProps.fileType, drawX, drawY, drawW, drawH);
        } else {
          doc.setTextColor(148, 163, 184);
          doc.setFontSize(8);
          doc.text('No Photo', photoX + photoSize / 2, photoY + photoSize / 2, { align: 'center' });
        }
      } catch (err) {
        console.warn('Could not add image to PDF for visitor', log.id, err);
      }

      // Draw Separator Line
      const sepX = photoX + photoSize + 8;
      doc.setDrawColor(226, 232, 240);
      doc.line(sepX, startY + 5, sepX, startY + cardHeight - 5);

      // Text Section 1: Visitor Details
      const textX = sepX + 8;
      let currY = startY + 12;

      doc.setTextColor(15, 23, 42); // Slate 900
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizeText(log.fullName).toUpperCase(), textX, currY);

      currY += 7;
      doc.setTextColor(71, 85, 105); // Slate 600
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Mobile: ${log.mobileNumber}`, textX, currY);
      
      currY += 6;
      doc.text(`Type: ${sanitizeText(log.guestType).toUpperCase()}`, textX, currY);
      
      currY += 6;
      doc.text(`Target: Flat ${log.wing}-${log.flatNo} (${sanitizeText(log.flatOwnerName) || 'Unknown'})`, textX, currY);

      // Text Section 2: Visit Timestamps & Status
      const rightX = pageWidth - margin - 5;
      currY = startY + 12;

      // Status Badge (Draw a colored pill)
      let statusColor = [226, 232, 240]; // default gray
      let statusTextColor = [100, 116, 139];
      if (log.status === 'approved') {
        statusColor = [209, 250, 229]; // emerald 100
        statusTextColor = [4, 120, 87]; // emerald 700
      } else if (log.status === 'rejected') {
        statusColor = [254, 226, 226]; // red 100
        statusTextColor = [185, 28, 28]; // red 700
      } else if (log.status === 'pending') {
        statusColor = [254, 243, 199]; // amber 100
        statusTextColor = [180, 83, 9]; // amber 700
      }

      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.roundedRect(rightX - 25, currY - 6, 25, 8, 2, 2, 'F');
      
      doc.setTextColor(statusTextColor[0], statusTextColor[1], statusTextColor[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(log.status.toUpperCase(), rightX - 12.5, currY - 0.5, { align: 'center' });

      currY += 10;
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('CHECK-IN:', rightX, currY, { align: 'right' });
      
      currY += 5;
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(new Date(log.requestTime).toLocaleString('en-IN', {
        dateStyle: 'short', timeStyle: 'short'
      }), rightX, currY, { align: 'right' });

      currY += 8;
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('RESPONSE TIME:', rightX, currY, { align: 'right' });
      
      currY += 5;
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(log.respondedTime ? new Date(log.respondedTime).toLocaleString('en-IN', {
        dateStyle: 'short', timeStyle: 'short'
      }) : 'Waiting...', rightX, currY, { align: 'right' });

      if (isAdmin && (log.ipAddress || log.deviceImei)) {
        currY += 7;
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text(`IP: ${log.ipAddress || 'N/A'} | SN: ${log.deviceImei || 'N/A'}`, rightX, currY, { align: 'right' });
      }

      startY += cardHeight + cardSpacing;
      currentLogIndex++;
    }
    
    // Page Footer
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${doc.internal.pages.length - 1}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  if (logs.length === 0) {
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(12);
    doc.text('No visitor records found for the selected criteria.', pageWidth / 2, 80, { align: 'center' });
  }

  doc.save(`Orchid_Heights_Visitors_${new Date().getTime()}.pdf`);
};
