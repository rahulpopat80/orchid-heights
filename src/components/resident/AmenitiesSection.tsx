import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  Dumbbell, 
  Film, 
  Sparkles, 
  Clock, 
  Check, 
  AlertCircle, 
  Plus, 
  Upload, 
  X, 
  CheckSquare, 
  PlusCircle, 
  ArrowRight, 
  Users, 
  CheckCircle2, 
  Download, 
  Trash2,
  ChevronRight,
  ArrowLeft,
  Timer,
  Camera
} from 'lucide-react';
import { AmenityBooking, GymTheatreLog } from '../../types';
import { db, collection, onSnapshot, doc, setDoc, deleteDoc, createSocietyNotification } from '../../lib/firebase';
import { uploadFileInChunks } from '../../lib/fileStorage';
import ChunkedMedia from '../ChunkedMedia';

interface AmenitiesSectionProps {
  wing: string;
  flatNo: number;
  amenityBookings: AmenityBooking[];
  gymTheatreLogs: GymTheatreLog[];
  handleAddAmenityBooking: (e: React.FormEvent) => void;
  handleVoteAmenityBooking: (id: string) => void;
  handleCheckInGymTheatre: (amenity: 'Gym' | 'Theatre') => void;
  handleCheckOutGymTheatreFlow: (log: GymTheatreLog) => void;
  showExitPhotoModal: boolean;
  setShowExitPhotoModal: (show: boolean) => void;
  exitPhotoBase64: string;
  handleExitPhotoChange: (file: File) => void;
  handleConfirmCheckOut: () => void;
  exitPhotoTimeError: boolean;
  activeCheckInLog: GymTheatreLog | null;
  gymTheatreSuccess: string;
  gymTheatreError: string;
  amenityBookingSuccess: string;
  amenityBookingError: string;

  // Form states passed down
  fPropertyName: string;
  setFPropertyName: (text: string) => void;
  fDateFrom: string;
  setFDateFrom: (text: string) => void;
  fDateTo: string;
  setFDateTo: (text: string) => void;
  fReason: string;
  setFReason: (text: string) => void;
  fStuffNeeded: string;
  setFStuffNeeded: (text: string) => void;
  fParkingRequest: string;
  setFParkingRequest: (text: string) => void;

  // Notification tab override prop
  activeTabOverride?: 'bookings' | 'gym_theatre' | 'movies' | null;
  onClearOverride?: () => void;
  role?: string;
}

export default function AmenitiesSection({
  wing,
  flatNo,
  amenityBookings,
  gymTheatreLogs,
  handleAddAmenityBooking,
  handleVoteAmenityBooking,
  handleCheckInGymTheatre,
  handleCheckOutGymTheatreFlow,
  showExitPhotoModal,
  setShowExitPhotoModal,
  exitPhotoBase64,
  handleExitPhotoChange,
  handleConfirmCheckOut,
  exitPhotoTimeError,
  activeCheckInLog,
  gymTheatreSuccess,
  gymTheatreError,
  amenityBookingSuccess,
  amenityBookingError,
  fPropertyName,
  setFPropertyName,
  fDateFrom,
  setFDateFrom,
  fDateTo,
  setFDateTo,
  fReason,
  setFReason,
  fStuffNeeded,
  setFStuffNeeded,
  fParkingRequest,
  setFParkingRequest,
  activeTabOverride,
  onClearOverride,
  role = 'owner'
}: AmenitiesSectionProps) {
  const myFlatId = `${wing}-${flatNo}`;
  const THRESHOLD = 49;

  // Sub-Blocks active screen state
  const [activeSub, setActiveSub] = useState<'menu' | 'gym_theatre' | 'movies' | 'bookings'>('menu');

  // Sync with URL and listen to popstate
  useEffect(() => {
    const handleLocationSync = () => {
      const path = window.location.pathname;
      if (path === '/amenities/gym-theatre') setActiveSub('gym_theatre');
      else if (path === '/amenities/movie') setActiveSub('movies');
      else if (path === '/amenities/booking') setActiveSub('bookings');
      else if (path === '/amenities') setActiveSub('menu');
    };
    handleLocationSync();
    window.addEventListener('popstate', handleLocationSync);
    return () => window.removeEventListener('popstate', handleLocationSync);
  }, []);

  const navigateToRoute = (path: string, sub: 'menu' | 'gym_theatre' | 'movies' | 'bookings') => {
    setActiveSub(sub);
    window.history.pushState(null, '', path);
  };

  useEffect(() => {
    if (activeTabOverride) {
      if (activeTabOverride === 'bookings') navigateToRoute('/amenities/booking', 'bookings');
      if (activeTabOverride === 'gym_theatre') navigateToRoute('/amenities/gym-theatre', 'gym_theatre');
      if (activeTabOverride === 'movies') navigateToRoute('/amenities/movie', 'movies');
      if (onClearOverride) onClearOverride();
    }
  }, [activeTabOverride, onClearOverride]);

  // Listen to deep redirect event from notifications block
  useEffect(() => {
    const handleDeepRedirect = () => {
      const target = localStorage.getItem('orchid_deep_redirect');
      if (target) {
        if (target === 'bookings') navigateToRoute('/amenities/booking', 'bookings');
        if (target === 'gym_theatre') navigateToRoute('/amenities/gym-theatre', 'gym_theatre');
        if (target === 'movies') navigateToRoute('/amenities/movie', 'movies');
        localStorage.removeItem('orchid_deep_redirect');
      }
    };
    window.addEventListener('orchid_amenities_redirect', handleDeepRedirect);
    handleDeepRedirect();
    return () => {
      window.removeEventListener('orchid_amenities_redirect', handleDeepRedirect);
    };
  }, []);

  // Real-time Movie Screenings state
  const [movies, setMovies] = useState<any[]>([]);
  const [showAddMovieForm, setShowAddMovieForm] = useState<boolean>(false);
  
  // Movie Form Fields
  const [mTitle, setMTitle] = useState<string>('');
  const [mGenre, setMGenre] = useState<string>('');
  const [mTiming, setMTiming] = useState<string>('');
  const [mDay, setMDay] = useState<string>('Friday');
  const [mDate, setMDate] = useState<string>('');
  const [mLength, setMLength] = useState<string>('');
  const [mTrailerUrl, setMTrailerUrl] = useState<string>('');
  const [mPosterUrl, setMPosterUrl] = useState<string>('');
  const [mRating, setMRating] = useState<string>('UA');
  const [mSynopsis, setMSynopsis] = useState<string>('');
  
  // Chunked poster uploading states
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [isUploadingPoster, setIsUploadingPoster] = useState<boolean>(false);
  const [moviePostSuccess, setMoviePostSuccess] = useState<string>('');
  const [moviePostError, setMoviePostError] = useState<string>('');

  // 1-month automatic retention for movies
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'movies_schedule'), async (snap) => {
      const list: any[] = [];
      const now = new Date();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const itemDate = data.date ? new Date(data.date) : null;
        
        // Auto-delete movie logs older than 1 month from firestore dynamically
        if (itemDate && itemDate.getTime() < oneMonthAgo.getTime()) {
          deleteDoc(doc(db, 'movies_schedule', docSnap.id)).catch(err => {
            console.error('Auto-cleanup movie error:', err);
          });
        } else {
          list.push({ id: docSnap.id, ...data });
        }
      });

      // Sort by date or createdAt
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setMovies(list);
    }, (error) => {
      console.error('Error listening to movies schedule:', error);
    });
    return () => unsub();
  }, []);

  const handlePosterChange = (file: File) => {
    setPosterFile(file);
    setMPosterUrl('Selected'); // visual flag
  };

  const handlePostMovie = async (e: React.FormEvent) => {
    e.preventDefault();
    setMoviePostError('');
    setMoviePostSuccess('');

    if (!mTitle.trim()) {
      setMoviePostError('Movie Name is required.');
      return;
    }
    if (!mDate) {
      setMoviePostError('Date is required.');
      return;
    }
    if (!mTiming.trim()) {
      setMoviePostError('Timing is required.');
      return;
    }
    if (!mLength.trim()) {
      setMoviePostError('Picture Length / Duration is required.');
      return;
    }

    setIsUploadingPoster(true);
    let finalPosterUrl = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=300&q=80';

    try {
      if (posterFile) {
        // Securely upload high-quality custom poster in chunks
        const meta = await uploadFileInChunks(posterFile);
        finalPosterUrl = meta.fileId;
      }

      const movieId = 'movie_' + Math.random().toString(36).substring(2, 11);
      const newMovie = {
        id: movieId,
        title: mTitle.trim(),
        genre: mGenre.trim() || 'Entertainment',
        timing: mTiming.trim(),
        day: mDay,
        date: mDate,
        length: mLength.trim(),
        trailerUrl: mTrailerUrl.trim() || null,
        posterUrl: finalPosterUrl,
        synopsis: mSynopsis.trim() || 'No synopsis available.',
        rating: mRating,
        createdAt: new Date().toISOString(),
        postedBy: myFlatId
      };

      await setDoc(doc(db, 'movies_schedule', movieId), newMovie);
      
      // Dispatch real-time society notification
      await createSocietyNotification({
        type: 'movie_schedule',
        title: `🎬 New Movie Scheduled: ${mTitle}`,
        message: `Scheduled by Flat ${myFlatId} for ${mDay} (${mDate}) at ${mTiming}. Duration: ${mLength}.`,
        wing,
        flatNo
      });

      setMoviePostSuccess(`Movie "${mTitle}" posted successfully and broadcasted to everyone!`);
      
      // Reset form
      setMTitle('');
      setMGenre('');
      setMTiming('');
      setMDay('Friday');
      setMDate('');
      setMLength('');
      setMTrailerUrl('');
      setMPosterUrl('');
      setMRating('UA');
      setMSynopsis('');
      setPosterFile(null);
      setShowAddMovieForm(false);
    } catch (err: any) {
      console.error('Failed to post movie screening:', err);
      setMoviePostError('Failed to schedule movie screening: ' + err.message);
    } finally {
      setIsUploadingPoster(false);
    }
  };

  // Find if currently checked in to Gym or Theatre
  const activeGym = gymTheatreLogs.find(l => l.flatId === myFlatId && l.amenity === 'Gym' && !l.checkOutTime);
  const activeTheatre = gymTheatreLogs.find(l => l.flatId === myFlatId && l.amenity === 'Theatre' && !l.checkOutTime);

  // Retain bookings & logs under 1 month
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const filteredBookings = amenityBookings.filter(b => {
    const dateLimit = b.createdAt ? new Date(b.createdAt) : new Date();
    return b.flatId === myFlatId && dateLimit.getTime() >= oneMonthAgo.getTime();
  });

  const filteredLogs = gymTheatreLogs.filter(l => {
    const dateLimit = l.createdAt ? new Date(l.createdAt) : new Date();
    return l.flatId === myFlatId && dateLimit.getTime() >= oneMonthAgo.getTime();
  });

  return (
    <div className="space-y-4 text-left">
      {/* ==================== VIEW 1: SUB-BLOCKS MENU ==================== */}
      <AnimatePresence mode="wait">
      {activeSub === 'menu' && (
        <motion.div key="menu" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-2 mb-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h4 className="font-display font-bold text-xs uppercase tracking-wider text-slate-600">
              Amenities & Reservations
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sub-Block 1: Gym & Movie Theatre Access Gate */}
            <div
              onClick={() => navigateToRoute('/amenities/gym-theatre', 'gym_theatre')}
              className="bg-white rounded-none p-6 border shadow-sm flex flex-col items-center justify-center min-h-[140px] text-center hover:shadow-md transition cursor-pointer relative group border-slate-200/60"
            >
              <div className="w-14 h-14 rounded-none bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-sm mb-3 group-hover:scale-105 transition-transform duration-300">
                <Dumbbell className="w-7 h-7" />
              </div>
              <h4 className="font-display font-bold text-slate-800 text-sm tracking-tight leading-snug">
                Gym & Theatre Access
              </h4>
            </div>

            {/* Sub-Block 2: Movie Theatre Schedule */}
            <div
              onClick={() => navigateToRoute('/amenities/movie', 'movies')}
              className="bg-white rounded-none p-6 border shadow-sm flex flex-col items-center justify-center min-h-[140px] text-center hover:shadow-md transition cursor-pointer relative group border-slate-200/60"
            >
              <div className="w-14 h-14 rounded-none bg-violet-50 text-violet-600 flex items-center justify-center shrink-0 shadow-sm mb-3 group-hover:scale-105 transition-transform duration-300">
                <Film className="w-7 h-7" />
              </div>
              <h4 className="font-display font-bold text-slate-800 text-sm tracking-tight leading-snug">
                Movie Theatre Schedule
              </h4>
            </div>

            {/* Sub-Block 3: Function Hall Booking Suite */}
            <div
              onClick={() => navigateToRoute('/amenities/booking', 'bookings')}
              className="bg-white rounded-none p-6 border shadow-sm flex flex-col items-center justify-center min-h-[140px] text-center hover:shadow-md transition cursor-pointer relative group border-slate-200/60"
            >
              <div className="w-14 h-14 rounded-none bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 shadow-sm mb-3 group-hover:scale-105 transition-transform duration-300">
                <Calendar className="w-7 h-7" />
              </div>
              <h4 className="font-display font-bold text-slate-800 text-sm tracking-tight leading-snug">
                Function Hall Bookings
              </h4>
            </div>
          </div>
        </motion.div>
      )}

      {/* ==================== SCREEN: GYM & THEATRE GATE ACCESS ==================== */}
      {activeSub === 'gym_theatre' && (
        <motion.div key="gym" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <button
              onClick={() => navigateToRoute('/amenities', 'menu')}
              className="flex items-center space-x-2 text-sm font-black text-indigo-700 hover:text-indigo-900 cursor-pointer transition select-none bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-5 py-2.5 rounded-full shadow-sm active:scale-95"
            >
              <ArrowLeft className="w-4 h-4 -ml-1" />
              <span className="uppercase tracking-widest text-[10px]">Back</span>
            </button>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
              Live Gateway Gate
            </span>
          </div>

          <div>
            <h3 className="font-display font-black text-slate-800 text-base">Gym & Mini Theatre Access Gate</h3>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5 font-sans">
              Enter entrance (Aagman) on departure, verify exit verification selfie snapshots (Vidaay).
            </p>
          </div>

          {gymTheatreError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>{gymTheatreError}</span>
            </div>
          )}

          {gymTheatreSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-3 rounded-xl text-xs flex items-center gap-2 font-bold">
              <Check className="w-4 h-4 text-emerald-500" />
              <span>{gymTheatreSuccess}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Gym Access Box */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between text-center hover:border-slate-300 transition">
              <div className="space-y-2">
                <span className="inline-flex w-11 h-11 bg-indigo-50 text-indigo-600 rounded-full items-center justify-center border border-indigo-100 shadow-xs text-xl">
                  🏋️
                </span>
                <div>
                  <h4 className="font-bold text-xs text-slate-800 uppercase tracking-tight">Society Fitness Gym</h4>
                  <p className="text-[9px] text-slate-400 mt-0.5">Live Occupancy Gate Tracking</p>
                </div>
              </div>

              <div className="mt-5">
                {activeGym ? (
                  <div className="space-y-2">
                    <div className="bg-indigo-50/60 border border-indigo-100 p-2.5 rounded-xl text-left">
                      <p className="text-[8px] font-mono font-bold text-slate-400 uppercase leading-none">Checked In At</p>
                      <p className="text-xs font-black text-slate-800 mt-1 font-mono">
                        {new Date(activeGym.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCheckOutGymTheatreFlow(activeGym)}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-2 px-4 rounded-xl text-[10px] uppercase cursor-pointer transition shadow-xs"
                    >
                      Vidaay (Exit Checkout)
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleCheckInGymTheatre('Gym')}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2 px-4 rounded-xl text-[10px] uppercase cursor-pointer transition shadow-xs"
                  >
                    Aagman (Enter Gym)
                  </button>
                )}
              </div>
            </div>

            {/* Theatre Access Box */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between text-center hover:border-slate-300 transition">
              <div className="space-y-2">
                <span className="inline-flex w-11 h-11 bg-indigo-50 text-indigo-600 rounded-full items-center justify-center border border-indigo-100 shadow-xs text-xl">
                  🎬
                </span>
                <div>
                  <h4 className="font-bold text-xs text-slate-800 uppercase tracking-tight">Mini Movie Theatre</h4>
                  <p className="text-[9px] text-slate-400 mt-0.5">Society Screening Room Admissions</p>
                </div>
              </div>

              <div className="mt-5">
                {activeTheatre ? (
                  <div className="space-y-2">
                    <div className="bg-indigo-50/60 border border-indigo-100 p-2.5 rounded-xl text-left">
                      <p className="text-[8px] font-mono font-bold text-slate-400 uppercase leading-none">Checked In At</p>
                      <p className="text-xs font-black text-slate-800 mt-1 font-mono">
                        {new Date(activeTheatre.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCheckOutGymTheatreFlow(activeTheatre)}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-2 px-4 rounded-xl text-[10px] uppercase cursor-pointer transition shadow-xs"
                    >
                      Vidaay (Exit Checkout)
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleCheckInGymTheatre('Theatre')}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2 px-4 rounded-xl text-[10px] uppercase cursor-pointer transition shadow-xs"
                  >
                    Aagman (Enter Theatre)
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Access Logs List (Filtered 1 Month) */}
          <div className="space-y-2.5 border-t border-slate-100 pt-4">
            <h4 className="font-display font-black text-[10px] uppercase tracking-wider text-slate-500">Access Logbook (Past 30 Days)</h4>
            
            {filteredLogs.length === 0 ? (
              <p className="text-[11px] text-slate-400 py-2">No logs registered in the past 30 days.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between text-[11px] gap-3">
                    <div className="text-left min-w-0 flex-1">
                      <p className="font-bold text-slate-800 uppercase text-[10px] truncate">
                        {log.amenity === 'Gym' ? '🏋️ Gym' : '🎭 Theatre'} ({log.flatId})
                      </p>
                      {log.memberName && (
                        <p className="text-[10px] font-bold text-indigo-700 mt-0.5">
                          Member: {log.memberName}
                        </p>
                      )}
                      {log.memberPhone && (
                        <p className="text-[9px] text-indigo-600 font-bold truncate">
                          Phone: {log.memberPhone}
                        </p>
                      )}
                      <p className="text-[8px] text-slate-400 font-mono mt-0.5">
                        In: {new Date(log.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} 
                        {log.checkOutTime && ` • Out: ${new Date(log.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {log.checkOutTime ? (
                        <div className="flex items-center space-x-2">
                          <span className="text-[7px] bg-emerald-50 text-emerald-800 border border-emerald-100 px-1 py-0.5 rounded font-mono font-bold uppercase">
                            {log.durationMinutes}m
                          </span>
                          {log.exitPhotoUrl && (
                            <div className="w-6 h-6 rounded border border-slate-200 overflow-hidden shrink-0">
                              {log.exitPhotoUrl.startsWith('file_') ? (
                                <ChunkedMedia fileId={log.exitPhotoUrl} type="image/jpeg" fallbackName="exit verification" />
                              ) : (
                                <img src={log.exitPhotoUrl} className="w-full h-full object-cover" alt="exit Verification" referrerPolicy="no-referrer" />
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[7px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider animate-pulse">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ==================== SCREEN: MOVIE THEATRE SCHEDULE ==================== */}
      {activeSub === 'movies' && (
        <motion.div key="movies" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <button
              onClick={() => navigateToRoute('/amenities', 'menu')}
              className="flex items-center space-x-2 text-sm font-black text-indigo-700 hover:text-indigo-900 cursor-pointer transition select-none bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-5 py-2.5 rounded-full shadow-sm active:scale-95"
            >
              <ArrowLeft className="w-4 h-4 -ml-1" />
              <span className="uppercase tracking-widest text-[10px]">Back</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddMovieForm(!showAddMovieForm)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-xl text-[9px] font-black uppercase transition flex items-center gap-1 cursor-pointer select-none shadow-xs"
              >
                {showAddMovieForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                <span>{showAddMovieForm ? 'Close' : 'Schedule'}</span>
              </button>
            </div>
          </div>

          <div>
            <h3 className="font-display font-black text-slate-800 text-base">Mini Movie Theatre Schedule</h3>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
              Explore scheduled blockbusters or add new ones. Movie schedules automatically auto-delete after 30 days.
            </p>
          </div>

          {/* Form */}
          {showAddMovieForm && (
            <form onSubmit={handlePostMovie} className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3 text-xs">
              <div className="flex items-center space-x-1.5 text-slate-800 border-b border-slate-200 pb-2 mb-2">
                <PlusCircle className="w-4 h-4 text-indigo-600" />
                <h4 className="font-display font-black text-[10px] uppercase tracking-wider">Post Movie Screening</h4>
              </div>

              {moviePostError && <div className="bg-red-50 text-red-700 p-2.5 border border-red-150 rounded-lg text-[10px]">{moviePostError}</div>}
              {moviePostSuccess && <div className="bg-emerald-50 text-emerald-700 p-2.5 border border-emerald-150 rounded-lg text-[10px] font-bold">{moviePostSuccess}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Movie Name *</label>
                  <input
                    type="text"
                    required
                    value={mTitle}
                    onChange={(e) => setMTitle(e.target.value)}
                    placeholder="e.g. Singham Again"
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold focus:border-indigo-500 transition outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Genre</label>
                  <input
                    type="text"
                    value={mGenre}
                    onChange={(e) => setMGenre(e.target.value)}
                    placeholder="e.g. Action / Comedy"
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold focus:border-indigo-500 transition outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Rating</label>
                  <select
                    value={mRating}
                    onChange={(e) => setMRating(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-bold focus:border-indigo-500 transition outline-none"
                  >
                    <option value="UA">UA • Parents Guidance</option>
                    <option value="U">U • Unrestricted</option>
                    <option value="A">A • Adults Only</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Day</label>
                  <select
                    value={mDay}
                    onChange={(e) => setMDay(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-bold focus:border-indigo-500 transition outline-none"
                  >
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={mDate}
                    onChange={(e) => setMDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold focus:border-indigo-500 transition outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Timing *</label>
                  <input
                    type="text"
                    required
                    value={mTiming}
                    onChange={(e) => setMTiming(e.target.value)}
                    placeholder="e.g. 8:00 PM"
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold focus:border-indigo-500 transition outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Length / Duration *</label>
                  <input
                    type="text"
                    required
                    value={mLength}
                    onChange={(e) => setMLength(e.target.value)}
                    placeholder="e.g. 2h 40m"
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold focus:border-indigo-500 transition outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Trailer Video Link</label>
                  <input
                    type="url"
                    value={mTrailerUrl}
                    onChange={(e) => setMTrailerUrl(e.target.value)}
                    placeholder="e.g. https://youtube.com/..."
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold focus:border-indigo-500 transition outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Poster Image (Highly Recommended)</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handlePosterChange(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                      id="movie-poster-input-ref"
                    />
                    <label
                      htmlFor="movie-poster-input-ref"
                      className="flex-1 bg-white border border-dashed border-slate-300 hover:border-indigo-500 p-2 rounded-lg text-center cursor-pointer text-slate-500 hover:text-indigo-600 transition flex items-center justify-center space-x-1.5 text-xs font-semibold"
                    >
                      <Upload className="w-4 h-4 shrink-0" />
                      <span className="truncate">{posterFile ? `Poster: ${posterFile.name}` : 'Upload Poster File'}</span>
                    </label>
                    {posterFile && (
                      <button
                        type="button"
                        onClick={() => setPosterFile(null)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-lg transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {isUploadingPoster && <p className="text-[9px] text-indigo-500 mt-1 animate-pulse">Uploading file chunks safely...</p>}
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Synopsis</label>
                <textarea
                  value={mSynopsis}
                  onChange={(e) => setMSynopsis(e.target.value)}
                  placeholder="Brief movie overview..."
                  rows={2}
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold focus:border-indigo-500 transition outline-none resize-none"
                ></textarea>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="submit"
                  disabled={isUploadingPoster}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-black px-5 py-2 rounded-xl text-[10px] uppercase tracking-wider cursor-pointer disabled:opacity-50 transition shadow-sm"
                >
                  {isUploadingPoster ? 'Processing Chunks...' : 'Post Screening'}
                </button>
              </div>
            </form>
          )}

          {/* List */}
          {movies.length === 0 ? (
            <div className="py-12 border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 bg-slate-50/20">
              <Film className="w-8 h-8 text-slate-200 mx-auto mb-2 animate-pulse" />
              <p className="text-xs font-semibold">No active upcoming screenings. Schedule a movie above!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {movies.map((movie) => {
                const isMyPosting = movie.postedBy === myFlatId;

                return (
                  <div key={movie.id} className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-slate-300 transition group relative">
                    
                    {/* Media render */}
                    <div className="relative h-44 w-full bg-slate-900 border-b border-slate-100 flex items-center justify-center overflow-hidden">
                      {movie.posterUrl?.startsWith('file_') ? (
                        <ChunkedMedia fileId={movie.posterUrl} type="image/jpeg" fallbackName={movie.title} />
                      ) : (
                        <img
                          src={movie.posterUrl || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=300&q=80'}
                          className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-102"
                          alt={movie.title}
                          referrerPolicy="no-referrer"
                        />
                      )}
                      
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        <span className="text-[8px] bg-slate-950/80 backdrop-blur-xs text-white font-black px-1.5 py-0.5 rounded uppercase tracking-wider font-mono border border-slate-800">
                          {movie.rating}
                        </span>
                      </div>

                      {isMyPosting && (
                        <button
                          onClick={async () => {
                            if (confirm(`Delete "${movie.title}" screening schedule?`)) {
                              try {
                                await deleteDoc(doc(db, 'movies_schedule', movie.id));
                              } catch (e) {
                                alert('Failed to delete movie schedule.');
                              }
                            }
                          }}
                          className="absolute top-2.5 right-2.5 bg-red-600/90 hover:bg-red-700 text-white p-1.5 rounded-lg transition shadow-sm cursor-pointer select-none"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="p-3 text-left space-y-2 flex-1 flex flex-col justify-between">
                      <div className="space-y-1">
                        <h4 className="font-display font-black text-slate-800 text-xs sm:text-sm tracking-tight leading-tight uppercase truncate">
                          {movie.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-1.5 text-[9px] text-indigo-600 font-bold font-mono">
                          <span>{movie.genre}</span>
                          <span className="text-slate-300">•</span>
                          <span>{movie.day} • {movie.date}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal font-medium line-clamp-3 pt-1">
                          {movie.synopsis}
                        </p>
                      </div>

                      <div className="border-t border-slate-150 pt-2 mt-2 flex items-center justify-between text-[10px]">
                        <div className="text-left font-mono">
                          <p className="text-[7px] font-bold text-slate-400 uppercase leading-none">Screening timing</p>
                          <p className="text-slate-700 font-black mt-1 uppercase text-[9px]">
                            🕒 {movie.timing}
                          </p>
                          <p className="text-[8px] text-slate-400 mt-0.5">
                            ⏳ {movie.length || 'N/A'} • Flat {movie.postedBy}
                          </p>
                        </div>

                        {movie.trailerUrl && (
                          <a
                            href={movie.trailerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white border border-slate-200 hover:border-slate-350 text-slate-700 font-extrabold px-2.5 py-1.5 rounded-lg text-[9px] uppercase transition flex items-center gap-1 cursor-pointer select-none shadow-xs"
                          >
                            <span>Trailer</span>
                            <ArrowRight className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ==================== SCREEN: FUNCTION HALL BOOKINGS & DECISION ENGINE ==================== */}
      {activeSub === 'bookings' && (
        <motion.div key="bookings" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:0.2}} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <button
              onClick={() => navigateToRoute('/amenities', 'menu')}
              className="flex items-center space-x-2 text-sm font-black text-indigo-700 hover:text-indigo-900 cursor-pointer transition select-none bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-5 py-2.5 rounded-full shadow-sm active:scale-95"
            >
              <ArrowLeft className="w-4 h-4 -ml-1" />
              <span className="uppercase tracking-widest text-[10px]">Back</span>
            </button>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
              Booking Suite
            </span>
          </div>

          <div>
            <h3 className="font-display font-black text-slate-800 text-base">Function Hall Bookings Suite</h3>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5 font-sans">
              Host family events, request community votes, and monitor the committee 72-hour review deadline limit.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Booking Form */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 p-4 sm:p-5 rounded-2xl space-y-4 text-left">
              <div className="flex items-center space-x-1.5 text-slate-800">
                <PlusCircle className="w-4 h-4 text-indigo-600" />
                <h4 className="font-display font-bold text-xs uppercase tracking-wider">Request Venue</h4>
              </div>

              {amenityBookingError && <div className="bg-red-50 text-red-700 p-3 rounded-xl border border-red-100 text-xs">{amenityBookingError}</div>}
              {amenityBookingSuccess && <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl border border-emerald-100 text-xs font-bold">{amenityBookingSuccess}</div>}

              <form onSubmit={handleAddAmenityBooking} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 mb-1.5 uppercase">Location / Venue Property *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Clubhouse Party Hall"
                    value={fPropertyName}
                    onChange={(e) => setFPropertyName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 mb-1.5 uppercase">Start Date & Time</label>
                    <input
                      type="datetime-local"
                      required
                      value={fDateFrom}
                      onChange={(e) => setFDateFrom(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 mb-1.5 uppercase">End Date & Time</label>
                    <input
                      type="datetime-local"
                      required
                      value={fDateTo}
                      onChange={(e) => setFDateTo(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 mb-1.5 uppercase">Purpose of Event / Function *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Daughter's 5th Birthday Celebration"
                    value={fReason}
                    onChange={(e) => setFReason(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 mb-1.5 uppercase">Required Materials / Setup *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. sound system, 100 chairs, buffet tables, generator"
                    value={fStuffNeeded}
                    onChange={(e) => setFStuffNeeded(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-500 mb-1.5 uppercase">Special Requests & Gate Permissions *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 10 visitor parking slots, late extension till 11 PM"
                    value={fParkingRequest}
                    onChange={(e) => setFParkingRequest(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-amber-800 text-[10px] font-medium leading-relaxed">
                  ⚠️ <strong>72-Hour Decision Rule:</strong> The Administration must respond with approval status within 72 hours of submission.
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer shadow-sm select-none"
                >
                  Submit Booking Request
                </button>
              </form>
            </div>

            {/* Bookings Queue */}
            <div className="lg:col-span-7 space-y-4">
              <h4 className="font-display font-black text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                Active Bookings & Voting Boards
              </h4>

              {filteredBookings.length === 0 ? (
                <div className="py-12 border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 bg-slate-50/20">
                  <Calendar className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs">No active pavilion or hall reservations requested yet.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
                  {filteredBookings.map((b) => {
                    const isMyBooking = b.flatId === myFlatId;
                    const votesCount = b.approvedFlats?.length || 0;
                    const alreadyVoted = b.approvedFlats?.includes(myFlatId);
                    
                    // 72 hours deadline countdown
                    const submissionTime = b.createdAt ? new Date(b.createdAt).getTime() : Date.now();
                    const deadlineTime = submissionTime + 72 * 60 * 60 * 1000;
                    const hoursLeft = Math.max(0, Math.round((deadlineTime - Date.now()) / (60 * 60 * 1000)));

                    return (
                      <div key={b.id} className="border border-slate-200 p-4 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition space-y-3.5">
                        <div className="flex justify-between items-start gap-3">
                          <div>
                            <span className="font-mono bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[9px] uppercase border border-amber-150">
                              🏠 {b.propertyName}
                            </span>
                            <p className="text-[10px] text-slate-400 font-mono mt-1">Requested by: Flat {b.flatId}</p>
                          </div>

                          <div className="text-right">
                            {hoursLeft > 0 ? (
                              <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full text-[8px] font-mono font-bold uppercase tracking-wider flex items-center shrink-0">
                                <Timer className="w-3 h-3 mr-1" /> {hoursLeft} hrs left
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full text-[8px] font-mono font-bold uppercase shrink-0">
                                Deadline Expired
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="bg-white border border-slate-150 p-3 rounded-xl text-xs space-y-2 text-left">
                          <p className="text-slate-700 font-bold text-xs uppercase leading-tight">
                            🎯 Event Purpose: <span className="font-sans font-black text-slate-900">{b.reason}</span>
                          </p>
                          
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono border-t border-slate-100 pt-1.5 mt-1">
                            <p className="text-slate-500">From: <strong className="text-slate-700 block mt-0.5">{new Date(b.dateFrom).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong></p>
                            <p className="text-slate-500">To: <strong className="text-slate-700 block mt-0.5">{new Date(b.dateTo).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong></p>
                          </div>

                          <div className="border-t border-slate-100 pt-1.5 space-y-1">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Setup Material List</p>
                            <p className="text-[11px] text-slate-600 font-medium font-sans leading-relaxed">🛠️ {b.stuffNeeded}</p>
                          </div>

                          <div className="border-t border-slate-100 pt-1.5 space-y-1">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Special Permissions Asked</p>
                            <p className="text-[11px] text-slate-600 font-medium font-sans leading-relaxed">🔒 {b.parkingRequest || 'None requested'}</p>
                          </div>
                        </div>

                        {/* Vote board */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200/60 p-3 rounded-xl">
                          <div className="text-left font-sans">
                            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest font-mono">Resident Approval Votes</p>
                            <p className="text-slate-800 font-extrabold text-xs mt-1">
                              🗳️ {votesCount} / {THRESHOLD} flat approvals
                            </p>
                            <p className="text-[9px] text-slate-400">
                              Requires 49 flats to vote before automatic committee confirmation triggers.
                            </p>
                          </div>

                          {!isMyBooking && (
                            <button
                              onClick={() => handleVoteAmenityBooking(b.id)}
                              className={`py-1.5 px-3 rounded-xl text-[10px] font-extrabold uppercase transition select-none cursor-pointer border ${
                                alreadyVoted
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-sm'
                              }`}
                            >
                              {alreadyVoted ? 'Approved ✓' : 'Approve Reservation'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
      {/* Exit Photo Modal */}
      {showExitPhotoModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowExitPhotoModal(false)}></div>
          <div className="relative bg-white rounded-3xl p-5 shadow-2xl w-full max-w-sm space-y-4">
            <div className="text-center">
              <h3 className="font-display font-black text-lg text-slate-800 tracking-tight">Checkout Verification</h3>
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-1">
                Please upload or capture a live picture of the property to verify your exit. (Max 10 mins old).
              </p>
            </div>
            {exitPhotoTimeError && (
              <div className="bg-red-50 text-red-700 p-2 rounded-xl text-[10px] font-bold border border-red-100 text-center">
                Picture is older than 10 minutes. Please take a live photo.
              </div>
            )}
            {gymTheatreError && (
              <div className="bg-red-50 text-red-700 p-2 rounded-xl text-[10px] font-bold border border-red-100 text-center">
                {gymTheatreError}
              </div>
            )}
            
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[140px]">
              {exitPhotoBase64 ? (
                <div className="relative">
                  <img src={exitPhotoBase64} alt="Exit Verification" className="w-24 h-24 object-cover rounded-2xl border-4 border-white shadow-md" />
                  <button
                    onClick={() => handleExitPhotoChange(null as any)}
                    className="absolute -top-2 -right-2 bg-slate-800 text-white p-1 rounded-full hover:bg-slate-700 shadow-sm"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center cursor-pointer w-full h-full text-indigo-600 hover:text-indigo-700 transition">
                  <div className="bg-white p-3 rounded-full shadow-sm mb-2 border border-indigo-100">
                    <Camera className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider">Tap to Capture/Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleExitPhotoChange(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowExitPhotoModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-[10px] uppercase transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCheckOut}
                disabled={!exitPhotoBase64}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl text-[10px] uppercase transition shadow-md"
              >
                Confirm Exit
              </button>
            </div>
          </div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
}






