import jsPDF from 'jspdf';
import { Visitor, GymTheatreLog, AmenityBooking } from '../types';

const sanitizeText = (str: string) => {
  if (!str) return '';
  const clean = str.replace(/[^\x00-\x7F]/g, '').trim();
  return clean || '[Local Name]';
};

const getBase64ImageFromURL = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Failed to create canvas context'));
      }
    };
    img.onerror = error => reject(error);
    img.src = url;
  });
};

const drawPDFHeader = async (doc: jsPDF, title: string, subtitle: string, pageWidth: number) => {
  doc.setFillColor(216, 27, 96); // Dark Pink (Orchid) #d81b60
  doc.rect(0, 0, pageWidth, 28, 'F');
  
  try {
    const logoBase64 = await getBase64ImageFromURL('https://i.ibb.co/zT5tpcdY/1000296229-1.png');
    doc.addImage(logoBase64, 'PNG', 10, 4, 20, 20);
  } catch (err) {
    console.warn('Could not load logo for PDF', err);
  }

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
  doc.text(`${subtitle} | Generated: ${new Date().toLocaleString('en-IN')}`, 15, 35);
  
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.line(15, 38, pageWidth - 15, 38);
};

export const generateVisitorPDF = async (logs: Visitor[], title: string, subtitle: string, isAdmin: boolean = false) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const logsPerPage = 4;
  const cardHeight = 60;
  const cardSpacing = 5;

  let currentLogIndex = 0;
  
  while (currentLogIndex < logs.length) {
    if (currentLogIndex > 0) doc.addPage();
    await drawPDFHeader(doc, title, subtitle, pageWidth);
    let startY = 43;

    for (let i = 0; i < logsPerPage && currentLogIndex < logs.length; i++) {
      const log = logs[currentLogIndex];
      doc.setFillColor(253, 242, 248); // pink-50
      doc.setDrawColor(244, 114, 182); // pink-400
      doc.roundedRect(margin, startY, contentWidth, cardHeight, 3, 3, 'FD');

      const photoSize = 50;
      const photoX = margin + 5;
      const photoY = startY + 5;
      doc.setDrawColor(252, 165, 165);
      doc.rect(photoX, photoY, photoSize, photoSize);
      
      try {
        if (log.photoUrl && log.photoUrl.startsWith('data:image')) {
          const imgProps = doc.getImageProperties(log.photoUrl);
          const scale = Math.min(photoSize / imgProps.width, photoSize / imgProps.height);
          doc.addImage(log.photoUrl, imgProps.fileType, photoX + (photoSize - imgProps.width * scale) / 2, photoY + (photoSize - imgProps.height * scale) / 2, imgProps.width * scale, imgProps.height * scale);
        } else {
          doc.setTextColor(156, 163, 175);
          doc.setFontSize(8);
          doc.text('No Photo', photoX + photoSize / 2, photoY + photoSize / 2, { align: 'center' });
        }
      } catch (err) {}

      const sepX = photoX + photoSize + 8;
      doc.setDrawColor(252, 165, 165);
      doc.line(sepX, startY + 5, sepX, startY + cardHeight - 5);

      const textX = sepX + 8;
      let currY = startY + 12;

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizeText(log.fullName).toUpperCase(), textX, currY);

      currY += 7;
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Mobile: ${log.mobileNumber}`, textX, currY);
      
      currY += 6;
      doc.text(`Type: ${sanitizeText(log.guestType).toUpperCase()}`, textX, currY);
      
      currY += 6;
      doc.text(`Target: Flat ${log.wing}-${log.flatNo} (${sanitizeText(log.flatOwnerName) || 'Resident'})`, textX, currY);

      const rightX = pageWidth - margin - 5;
      currY = startY + 12;

      let statusColor = [226, 232, 240];
      let statusTextColor = [100, 116, 139];
      if (log.status === 'approved') { statusColor = [209, 250, 229]; statusTextColor = [4, 120, 87]; }
      else if (log.status === 'rejected') { statusColor = [254, 226, 226]; statusTextColor = [185, 28, 28]; }
      else if (log.status === 'pending') { statusColor = [254, 243, 199]; statusTextColor = [180, 83, 9]; }

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
      doc.text(new Date(log.requestTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }), rightX, currY, { align: 'right' });

      currY += 8;
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('RESPONSE TIME:', rightX, currY, { align: 'right' });
      
      currY += 5;
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(log.respondedTime ? new Date(log.respondedTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : 'Waiting...', rightX, currY, { align: 'right' });

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
    
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${doc.internal.pages.length - 1}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  if (logs.length === 0) {
    await drawPDFHeader(doc, title, subtitle, pageWidth);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(12);
    doc.text('No visitor records found for the selected criteria.', pageWidth / 2, 80, { align: 'center' });
  }

  doc.save(`Orchid_Heights_Visitors_${new Date().getTime()}.pdf`);
};

export const generateGymTheatrePDF = async (logs: GymTheatreLog[], title: string, subtitle: string, isAdmin: boolean = false, owners: any[] = []) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const logsPerPage = 4;
  const cardHeight = 60;
  const cardSpacing = 5;

  let currentLogIndex = 0;
  
  while (currentLogIndex < logs.length) {
    if (currentLogIndex > 0) doc.addPage();
    await drawPDFHeader(doc, title, subtitle, pageWidth);
    let startY = 43;

    for (let i = 0; i < logsPerPage && currentLogIndex < logs.length; i++) {
      const log = logs[currentLogIndex];
      const ownerMatch = owners.find(o => `${o.wing}-${o.flatNo}` === log.flatId);
      const ownerName = ownerMatch ? ownerMatch.nameEn : 'Resident';

      doc.setFillColor(253, 242, 248); // pink-50
      doc.setDrawColor(244, 114, 182); // pink-400
      doc.roundedRect(margin, startY, contentWidth, cardHeight, 3, 3, 'FD');

      const photoSize = 50;
      const photoX = margin + 5;
      const photoY = startY + 5;
      doc.setDrawColor(252, 165, 165);
      doc.rect(photoX, photoY, photoSize, photoSize);
      
      try {
        if (log.exitPhotoUrl && log.exitPhotoUrl.startsWith('data:image')) {
          const imgProps = doc.getImageProperties(log.exitPhotoUrl);
          const scale = Math.min(photoSize / imgProps.width, photoSize / imgProps.height);
          doc.addImage(log.exitPhotoUrl, imgProps.fileType, photoX + (photoSize - imgProps.width * scale) / 2, photoY + (photoSize - imgProps.height * scale) / 2, imgProps.width * scale, imgProps.height * scale);
        } else {
          doc.setTextColor(156, 163, 175);
          doc.setFontSize(8);
          doc.text('No Exit Photo', photoX + photoSize / 2, photoY + photoSize / 2, { align: 'center' });
        }
      } catch (err) {}

      const sepX = photoX + photoSize + 8;
      doc.setDrawColor(252, 165, 165);
      doc.line(sepX, startY + 5, sepX, startY + cardHeight - 5);

      const textX = sepX + 8;
      let currY = startY + 12;

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizeText(log.amenity).toUpperCase() + ' ACCESS', textX, currY);

      currY += 7;
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Flat: ${log.flatId} (${sanitizeText(ownerName)})`, textX, currY);
      
      currY += 6;
      doc.text(`Duration: ${log.durationMinutes ? log.durationMinutes + ' mins' : 'In Progress'}`, textX, currY);

      const rightX = pageWidth - margin - 5;
      currY = startY + 12;

      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('CHECK-IN:', rightX, currY, { align: 'right' });
      
      currY += 5;
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(new Date(log.checkInTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }), rightX, currY, { align: 'right' });

      currY += 8;
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('CHECK-OUT:', rightX, currY, { align: 'right' });
      
      currY += 5;
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(log.checkOutTime ? new Date(log.checkOutTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '---', rightX, currY, { align: 'right' });

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
    
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${doc.internal.pages.length - 1}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  if (logs.length === 0) {
    await drawPDFHeader(doc, title, subtitle, pageWidth);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(12);
    doc.text('No logs found for the selected criteria.', pageWidth / 2, 80, { align: 'center' });
  }

  doc.save(`Orchid_Heights_GymTheatre_${new Date().getTime()}.pdf`);
};

export const generateMoviePDF = async (logs: any[], title: string, subtitle: string, isAdmin: boolean = false, owners: any[] = []) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const logsPerPage = 3;
  const cardHeight = 70;
  const cardSpacing = 5;

  let currentLogIndex = 0;
  
  while (currentLogIndex < logs.length) {
    if (currentLogIndex > 0) doc.addPage();
    await drawPDFHeader(doc, title, subtitle, pageWidth);
    let startY = 43;

    for (let i = 0; i < logsPerPage && currentLogIndex < logs.length; i++) {
      const log = logs[currentLogIndex];
      const ownerMatch = owners.find(o => `${o.wing}-${o.flatNo}` === log.hostFlat);
      const ownerName = ownerMatch ? ownerMatch.nameEn : 'Resident';

      doc.setFillColor(253, 242, 248);
      doc.setDrawColor(244, 114, 182);
      doc.roundedRect(margin, startY, contentWidth, cardHeight, 3, 3, 'FD');

      const photoSize = 60;
      const photoX = margin + 5;
      const photoY = startY + 5;
      doc.setDrawColor(252, 165, 165);
      doc.rect(photoX, photoY, photoSize, photoSize);
      
      try {
        if (log.posterUrl && log.posterUrl.startsWith('data:image')) {
          const imgProps = doc.getImageProperties(log.posterUrl);
          const scale = Math.min(photoSize / imgProps.width, photoSize / imgProps.height);
          doc.addImage(log.posterUrl, imgProps.fileType, photoX + (photoSize - imgProps.width * scale) / 2, photoY + (photoSize - imgProps.height * scale) / 2, imgProps.width * scale, imgProps.height * scale);
        } else {
          doc.setTextColor(156, 163, 175);
          doc.setFontSize(8);
          doc.text('No Poster', photoX + photoSize / 2, photoY + photoSize / 2, { align: 'center' });
        }
      } catch (err) {}

      const sepX = photoX + photoSize + 8;
      doc.setDrawColor(252, 165, 165);
      doc.line(sepX, startY + 5, sepX, startY + cardHeight - 5);

      const textX = sepX + 8;
      let currY = startY + 12;

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizeText(log.title).toUpperCase(), textX, currY);

      currY += 7;
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Host: Flat ${log.hostFlat} (${sanitizeText(ownerName)})`, textX, currY);
      
      currY += 6;
      doc.text(`Showtime: ${new Date(log.showTime).toLocaleString('en-IN')}`, textX, currY);

      const rightX = pageWidth - margin - 5;
      currY = startY + 12;

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
    
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${doc.internal.pages.length - 1}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  if (logs.length === 0) {
    await drawPDFHeader(doc, title, subtitle, pageWidth);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(12);
    doc.text('No movies found for the selected criteria.', pageWidth / 2, 80, { align: 'center' });
  }

  doc.save(`Orchid_Heights_Movies_${new Date().getTime()}.pdf`);
};

export const generateAmenityPDF = async (logs: AmenityBooking[], title: string, subtitle: string, isAdmin: boolean = false, owners: any[] = []) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const logsPerPage = 4;
  const cardHeight = 60;
  const cardSpacing = 5;

  let currentLogIndex = 0;
  
  while (currentLogIndex < logs.length) {
    if (currentLogIndex > 0) doc.addPage();
    await drawPDFHeader(doc, title, subtitle, pageWidth);
    let startY = 43;

    for (let i = 0; i < logsPerPage && currentLogIndex < logs.length; i++) {
      const log = logs[currentLogIndex];
      const ownerMatch = owners.find(o => `${o.wing}-${o.flatNo}` === log.flatId);
      const ownerName = ownerMatch ? ownerMatch.nameEn : 'Resident';

      doc.setFillColor(253, 242, 248);
      doc.setDrawColor(244, 114, 182);
      doc.roundedRect(margin, startY, contentWidth, cardHeight, 3, 3, 'FD');

      const textX = margin + 5;
      let currY = startY + 12;

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizeText(log.propertyName).toUpperCase(), textX, currY);

      currY += 7;
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Requested By: Flat ${log.flatId} (${sanitizeText(ownerName)})`, textX, currY);
      
      currY += 6;
      doc.text(`Reason: ${sanitizeText(log.reason)}`, textX, currY);

      const rightX = pageWidth - margin - 5;
      currY = startY + 12;

      let statusColor = [226, 232, 240];
      let statusTextColor = [100, 116, 139];
      if (log.status === 'approved') { statusColor = [209, 250, 229]; statusTextColor = [4, 120, 87]; }
      else if (log.status === 'rejected') { statusColor = [254, 226, 226]; statusTextColor = [185, 28, 28]; }
      else if (log.status === 'pending') { statusColor = [254, 243, 199]; statusTextColor = [180, 83, 9]; }

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
      doc.text('FROM:', rightX, currY, { align: 'right' });
      
      currY += 5;
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(new Date(log.dateFrom).toLocaleDateString('en-IN'), rightX, currY, { align: 'right' });

      currY += 8;
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('TO:', rightX, currY, { align: 'right' });
      
      currY += 5;
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(new Date(log.dateTo).toLocaleDateString('en-IN'), rightX, currY, { align: 'right' });

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
    
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${doc.internal.pages.length - 1}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  if (logs.length === 0) {
    await drawPDFHeader(doc, title, subtitle, pageWidth);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(12);
    doc.text('No amenity records found for the selected criteria.', pageWidth / 2, 80, { align: 'center' });
  }

  doc.save(`Orchid_Heights_Amenities_${new Date().getTime()}.pdf`);
};

