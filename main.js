import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  Modal,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import MenuIcon from '@mui/icons-material/More';
import SearchIcon from '@mui/icons-material/Search';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import ShareIcon from '@mui/icons-material/Share';
import PrintIcon from '@mui/icons-material/Print';
import GetAppIcon from '@mui/icons-material/GetApp';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ImageGalleryIcon from '@mui/icons-material/Collections';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import ListAltIcon from '@mui/icons-material/ListAlt';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import HTMLFlipBook from 'react-pageflip';

// ========================================
// CONFIGURATION & CONSTANTS
// ========================================

const STATIC_PDF_URL = '/propertyfish.pdf';
const PDF_WORKER_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs';
const APP_PRIMARY_COLOR = '#F05423'; // Orange from your app
const APP_DARK_BG = '#1a1a1a';
const APP_LIGHT_TEXT = '#ffffff';
const TOOLBAR_BG = 'rgba(28, 28, 28, 0.94)';
const TOOLBAR_BORDER = 'rgba(255, 255, 255, 0.08)';
const PANEL_BG = '#1f1f1f';
const PANEL_BORDER = 'rgba(255,255,255,0.12)';
const PAGE_FLIP_AUDIO_URL = '/flipsound.mpeg';
let flipAudio = null;

const getFlipAudio = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!flipAudio) {
    flipAudio = new Audio(PAGE_FLIP_AUDIO_URL);
    flipAudio.preload = 'auto';
    flipAudio.volume = 0.55;
  }

  return flipAudio;
};

/**
 * Play the page flip audio from the public folder
 */
const playFlipSound = async (soundEnabled = true) => {
  if (!soundEnabled) return;
  try {
    const audio = getFlipAudio();
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    await audio.play();
  } catch (e) {
    console.debug('Page flip audio playback failed');
  }
};

/**
 * Get responsive book dimensions based on viewport size
 * INCREASED SIZE: PDF now scales to 92% desktop width and 95% mobile width
 * Ensures flipbook fits well on mobile, tablet, and desktop
 */
const getViewportSize = (pageAspectRatio = 1.414) => {
  const safeAspectRatio = Number.isFinite(pageAspectRatio) && pageAspectRatio > 0 ? pageAspectRatio : 1.414;

  if (typeof window === 'undefined') {
    return { width: 540, height: Math.round(540 * safeAspectRatio), isMobile: false };
  }

  const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
  const isMobile = vw < 768;

  if (isMobile) {
    const availableWidth = Math.floor(vw * 0.92);
    const availableHeight = Math.floor(vh * 0.74);
    const pageWidth = Math.max(280, Math.floor(Math.min(availableWidth, availableHeight / safeAspectRatio)));
    const pageHeight = Math.floor(pageWidth * safeAspectRatio);
    return { width: pageWidth, height: pageHeight, isMobile };
  }

  const availableSpreadWidth = Math.floor(vw * 0.78);
  const availablePageHeight = Math.floor(vh * 0.78);
  const spreadWidth = Math.max(840, Math.floor(Math.min(availableSpreadWidth, (availablePageHeight / safeAspectRatio) * 2)));
  const pageWidth = Math.floor(spreadWidth / 2);
  const pageHeight = Math.floor(pageWidth * safeAspectRatio);
  return { width: pageWidth, height: pageHeight, isMobile };
};

/**
 * FlipbookViewer - Premium PDF flipbook with full toolbar controls
 * Features: zoom, search, pages, bookmarks, share, print, download, sound
 */
const FlipbookViewer = ({ pdfUrl = STATIC_PDF_URL, buttonLabel = 'Open Brochure' }) => {
  // ========================================
  // STATE MANAGEMENT
  // ========================================

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pages, setPages] = useState([]);
  const [pageAspectRatio, setPageAspectRatio] = useState(1.414);
  const [bookSize, setBookSize] = useState(() => getViewportSize(1.414));

  // Zoom state: starts at 100% (scale of 1.0)
  const [zoomLevel, setZoomLevel] = useState(100);
  const [currentPage, setCurrentPage] = useState(0);

  // Search & Filter state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Pages (TOC-like) state
  const [pagesOpen, setPagesOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);

  // Bookmarks state - store page numbers user bookmarked
  const [bookmarks, setBookmarks] = useState(new Set());
  const [bookmarkOpen, setBookmarkOpen] = useState(false);

  // Share dialog
  const [shareOpen, setShareOpen] = useState(false);

  // More menu (print, download, sound)
  const [moreOpen, setMoreOpen] = useState(false);

  // Sound toggle for flip animations
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isAutoplaying, setIsAutoplaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Component lifecycle refs
  const mountedRef = useRef(true);
  const loadedUrlRef = useRef('');
  const pdfTaskRef = useRef(null);
  const flipBookRef = useRef(null);
  const viewerRootRef = useRef(null);

  const syncCurrentPageFromBook = useCallback(() => {
    if (!flipBookRef.current) {
      return;
    }

    const pageFlip = flipBookRef.current.pageFlip();
    const pageIndex = pageFlip.getCurrentPageIndex();

    if (typeof pageIndex === 'number') {
      setCurrentPage(pageIndex);
    }
  }, []);

  const triggerFlipSound = useCallback(() => {
    playFlipSound(soundEnabled);
  }, [soundEnabled]);

  // ========================================
  // EFFECTS & LIFECYCLE
  // ========================================

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pdfTaskRef.current && typeof pdfTaskRef.current.destroy === 'function') {
        try {
          pdfTaskRef.current.destroy();
        } catch (e) {
          console.warn('PDF task cleanup error:', e);
        }
      }
    };
  }, []);

  /**
   * Handle window resize for responsive layout
   */
  useEffect(() => {
    const onResize = () => setBookSize(getViewportSize(pageAspectRatio));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pageAspectRatio]);

  useEffect(() => {
    if (!open || !flipBookRef.current) {
      return;
    }

    const timerId = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [open, currentPage, bookSize.isMobile]);

  useEffect(() => {
    if (!open || !isAutoplaying || pages.length <= 1) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const currentIndex = flipBookRef.current?.pageFlip().getCurrentPageIndex() ?? currentPage;

      if (currentIndex >= pages.length - 1) {
        setIsAutoplaying(false);
        return;
      }

      flipBookRef.current?.pageFlip().flipNext('top');
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [open, isAutoplaying, pages.length, currentPage]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // ========================================
  // PDF LOADING & PAGE RENDERING
  // ========================================

  /**
   * Load PDF and render all pages as JPEG images
   * Computes optimal scale based on viewport width
   */
  const loadPdfPages = useCallback(async () => {
    if (!pdfUrl) return;
    setLoading(true);
    setError('');

    try {
      // Dynamic import of PDF.js library
      const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_CDN;

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        withCredentials: false,
      });

      pdfTaskRef.current = loadingTask;
      const pdf = await loadingTask.promise;
      const pageImages = [];

      // Iterate through each page and render as image
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (!mountedRef.current) return;

        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });

        if (pageNumber === 1) {
          const nextAspectRatio = baseViewport.height / baseViewport.width;
          setPageAspectRatio(nextAspectRatio);
          setBookSize(getViewportSize(nextAspectRatio));
        }

        // Compute scale to fit page nicely in spread
        const targetWidth = Math.max(300, Math.min(1400, Math.floor(bookSize.width * 1.8)));
        const scale = Math.max(0.8, Math.min(2.0, targetWidth / baseViewport.width));
        const viewport = page.getViewport({ scale });

        // Create canvas for rendering
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { alpha: false });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        // Render PDF page to canvas
        await page.render({ canvasContext: context, viewport }).promise;

        // Convert to image data URL (JPEG for smaller file size)
        pageImages.push(canvas.toDataURL('image/jpeg', 0.85));

        // Clean up canvas memory
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      }

      if (!mountedRef.current) return;
      loadedUrlRef.current = pdfUrl;
      setPages(pageImages);
    } catch (e) {
      if (!mountedRef.current) return;
      console.error('Flipbook load error:', e);
      setError('Unable to load flipbook. Please try again or download the PDF directly.');
      setPages([]);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [bookSize.width, pdfUrl]);

  /**
   * Open flipbook modal and load PDF if not already loaded
   */
  const onOpen = async () => {
    setOpen(true);
    getFlipAudio();
    if (loadedUrlRef.current !== pdfUrl || pages.length === 0) {
      await loadPdfPages();
    }
  };

  // ========================================
  // ZOOM CONTROLS
  // ========================================

  /**
   * Increase zoom level (max 300%)
   */
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 20, 300));
  };

  /**
   * Decrease zoom level (min 50%)
   */
  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 20, 50));
  };

  /**
   * Reset zoom to 100%
   */
  const handleZoomReset = () => {
    setZoomLevel(100);
  };

  // ========================================
  // PAGE NAVIGATION
  // ========================================

  /**
   * Go to previous page
   * Updates state manually since turnToPrevPage doesn't always trigger onChangePage
   */
  const handlePrevPage = () => {
    if (flipBookRef.current && currentPage > 0) {
      flipBookRef.current.pageFlip().flipPrev('top');
    }
  };

  const handleFirstPage = () => {
    if (flipBookRef.current && pages.length > 0) {
      flipBookRef.current.pageFlip().flip(0, 'top');
      setCurrentPage(0);
    }
  };

  /**
   * Go to next page
   * Updates state manually since turnToNextPage doesn't always trigger onChangePage
   */
  const handleNextPage = () => {
    if (flipBookRef.current && currentPage < pages.length - 1) {
      flipBookRef.current.pageFlip().flipNext('top');
    }
  };

  const handleLastPage = () => {
    if (flipBookRef.current && pages.length > 0) {
      const lastPageIndex = pages.length - 1;
      flipBookRef.current.pageFlip().flip(lastPageIndex, 'top');
      setCurrentPage(lastPageIndex);
    }
  };

  /**
   * Handle page change from flipbook and update counter
   * This callback fires when user navigates pages via arrows or drag
   * Plays sound effect immediately if enabled
   */
  const handleFlip = useCallback((data) => {
    if (data && typeof data.data === 'number') {
      const newPage = data.data;
      setCurrentPage(newPage);
      triggerFlipSound();
      return;
    }

    syncCurrentPageFromBook();
  }, [syncCurrentPageFromBook, triggerFlipSound]);

  const handleBookInit = useCallback(() => {
    syncCurrentPageFromBook();
  }, [syncCurrentPageFromBook]);

  /**
   * Jump to specific page when clicking page thumbnails, bookmarks, or search results
   * Updates state immediately and plays sound
   */
  const handleGoToPage = (pageNum) => {
    if (flipBookRef.current && pageNum >= 0 && pageNum < pages.length) {
      flipBookRef.current.pageFlip().flip(pageNum, 'top');
      setCurrentPage(pageNum);
      setPagesOpen(false);
    }
  };

  const handlePageRegionClick = (direction) => {
    if (direction === 'prev') {
      handlePrevPage();
      return;
    }

    handleNextPage();
  };

  const handleToggleAutoplay = () => {
    setIsAutoplaying((prev) => !prev);
  };

  const isClosedBookView = !bookSize.isMobile && (currentPage === 0 || currentPage === pages.length - 1);
  const bookShellWidth = isClosedBookView
    ? `${Math.round(bookSize.width)}px`
    : bookSize.isMobile
      ? `${Math.round(bookSize.width)}px`
      : `${Math.round(bookSize.width * 2)}px`;
  const bookShellHeight = `${Math.round(bookSize.height)}px`;

  // ========================================
  // SEARCH FUNCTIONALITY
  // ========================================

  /**
   * Search for text across PDF pages
   * Note: This is a placeholder - full text search would require OCR or text extraction
   */
  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    // Placeholder: In production, would search actual text from PDF
    // For now, just show all pages as results as example
    setSearchResults(Array.from({ length: pages.length }, (_, i) => i));
  };

  /**
   * Go to search result page
   */
  const goToSearchResult = (pageNum) => {
    handleGoToPage(pageNum);
    setSearchOpen(false);
  };

  // ========================================
  // BOOKMARK FUNCTIONALITY
  // ========================================

  /**
   * Toggle bookmark on current page
   */
  const toggleBookmark = () => {
    setBookmarks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(currentPage)) {
        newSet.delete(currentPage);
      } else {
        newSet.add(currentPage);
      }
      return newSet;
    });
  };

  const handleBookmarkDialogOpen = () => {
    setBookmarkOpen(true);
  };

  /**
   * Go to bookmarked page
   */
  const goToBookmark = (pageNum) => {
    handleGoToPage(pageNum);
    setBookmarkOpen(false);
  };

  // ========================================
  // SHARE FUNCTIONALITY
  // ========================================

  /**
   * Copy share link to clipboard
   */
  const handleCopyShareLink = () => {
    const currentUrl = window.location.href;
    navigator.clipboard.writeText(currentUrl).then(() => {
      alert('Link copied to clipboard!');
      setShareOpen(false);
    });
  };

  // ========================================
  // PRINT & DOWNLOAD
  // ========================================

  /**
   * Print flipbook pages
   */
  const handlePrint = () => {
    window.print();
    setMoreOpen(false);
  };

  /**
   * Download original PDF
   */
  const handleDownloadPdf = () => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = 'brochure.pdf';
    link.click();
    setMoreOpen(false);
  };

  const handleDownloadCurrentPage = () => {
    const currentPageImage = pages[currentPage];
    if (!currentPageImage) {
      return;
    }

    const link = document.createElement('a');
    link.href = currentPageImage;
    link.download = `page-${currentPage + 1}.jpg`;
    link.click();
    setMoreOpen(false);
  };

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await viewerRootRef.current?.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (e) {
      console.debug('Fullscreen toggle failed', e);
    }
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const toolbarButtonSx = {
    color: 'rgba(255,255,255,0.88)',
    borderRadius: '6px',
    width: { xs: 30, sm: 34 },
    height: { xs: 30, sm: 34 },
    transition: 'all 0.18s ease',
    '&:hover': {
      color: '#fff',
      bgcolor: 'rgba(255,255,255,0.08)',
    },
    '&.Mui-disabled': {
      color: 'rgba(255,255,255,0.24)',
    },
  };
  const activeToolbarButtonSx = {
    ...toolbarButtonSx,
    color: APP_PRIMARY_COLOR,
    bgcolor: 'rgba(240,84,35,0.12)',
    '&:hover': {
      color: '#fff',
      bgcolor: APP_PRIMARY_COLOR,
    },
  };
  const darkDialogPaperSx = {
    bgcolor: PANEL_BG,
    color: APP_LIGHT_TEXT,
    border: `1px solid ${PANEL_BORDER}`,
    boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0))',
  };

  // ========================================
  // RENDER: MAIN BUTTON
  // ========================================

  return (
    <Box>
      {/* Main "Open Brochure" Button */}
      <Button
        variant="contained"
        onClick={onOpen}
        sx={{
          background: 'linear-gradient(180deg, #ff6f3d 0%, #d84c1f 100%)',
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.92rem',
          px: 2.25,
          py: 1,
          borderRadius: '6px',
          boxShadow: '0 10px 24px rgba(240,84,35,0.28)',
          '&:hover': {
            background: 'linear-gradient(180deg, #ff7d50 0%, #d84c1f 100%)',
            boxShadow: '0 12px 26px rgba(240,84,35,0.34)',
          },
        }}
      >
        {buttonLabel}
      </Button>

      {/* ========================================
         FLIPBOOK MODAL
         ======================================== */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          ref={viewerRootRef}
          sx={{
            width: '100%',
            height: '100vh',
            bgcolor: '#141414',
            backgroundImage: [
              'radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 30%)',
              'linear-gradient(180deg, #303030 0%, #111111 22%, #0a0a0a 100%)',
            ].join(','),
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {/* ========================================
             TOP TOOLBAR
             Page counter, zoom controls, close button
             ======================================== */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: { xs: 1, sm: 1.5 },
              py: 0.75,
              minHeight: 48,
              bgcolor: TOOLBAR_BG,
              borderBottom: `1px solid ${TOOLBAR_BORDER}`,
              boxShadow: '0 1px 0 rgba(255,255,255,0.04)',
              flexWrap: 'wrap',
              gap: 1,
              zIndex: 3,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 600, fontSize: { xs: '0.72rem', sm: '0.76rem' }, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Page
              </Typography>
              <Box
                sx={{
                  minWidth: 72,
                  px: 1,
                  py: 0.35,
                  borderRadius: '999px',
                  bgcolor: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${TOOLBAR_BORDER}`,
                  textAlign: 'center',
                }}
              >
                <Typography sx={{ color: APP_LIGHT_TEXT, fontWeight: 700, fontSize: { xs: '0.76rem', sm: '0.82rem' }, lineHeight: 1.2 }}>
                  {pages.length > 0 ? `${currentPage + 1} / ${pages.length}` : 'Loading'}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 0.2, alignItems: 'center', bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${TOOLBAR_BORDER}`, borderRadius: '8px', px: 0.35, py: 0.25 }}>
              <Tooltip title="First Page">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleFirstPage}
                    disabled={currentPage <= 0}
                    sx={toolbarButtonSx}
                  >
                    <FirstPageIcon sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }} />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="Previous Page">
                <span>
                  <IconButton
                    size="small"
                    onClick={handlePrevPage}
                    disabled={currentPage <= 0}
                    sx={toolbarButtonSx}
                  >
                    <ArrowBackIcon sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }} />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title={isAutoplaying ? 'Pause Auto Flip' : 'Start Auto Flip'}>
                <IconButton
                  size="small"
                  onClick={handleToggleAutoplay}
                  disabled={pages.length <= 1}
                  sx={isAutoplaying ? activeToolbarButtonSx : toolbarButtonSx}
                >
                  {isAutoplaying ? <PauseIcon sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }} /> : <PlayArrowIcon sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }} />}
                </IconButton>
              </Tooltip>

              <Tooltip title="Next Page">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleNextPage}
                    disabled={currentPage >= pages.length - 1}
                    sx={toolbarButtonSx}
                  >
                    <ArrowForwardIcon sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }} />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="Last Page">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleLastPage}
                    disabled={currentPage >= pages.length - 1}
                    sx={toolbarButtonSx}
                  >
                    <LastPageIcon sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>

            {/* Zoom Controls */}
            <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center', bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${TOOLBAR_BORDER}`, borderRadius: '8px', px: 0.35, py: 0.25 }}>
              <Tooltip title="Zoom Out">
                <IconButton
                  size="small"
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 50}
                  sx={toolbarButtonSx}
                >
                  <RemoveIcon sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }} />
                </IconButton>
              </Tooltip>

              <Typography
                sx={{
                  color: APP_LIGHT_TEXT,
                  fontSize: { xs: '0.72rem', sm: '0.78rem' },
                  minWidth: { xs: 38, sm: 42 },
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              >
                {zoomLevel}%
              </Typography>

              <Tooltip title="Zoom In">
                <IconButton
                  size="small"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 300}
                  sx={toolbarButtonSx}
                >
                  <AddIcon sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }} />
                </IconButton>
              </Tooltip>

              <Tooltip title="Reset Zoom">
                <Button
                  size="small"
                  onClick={handleZoomReset}
                  sx={{
                    color: 'rgba(255,255,255,0.76)',
                    textTransform: 'none',
                    minWidth: 0,
                    fontSize: { xs: '0.68rem', sm: '0.72rem' },
                    px: 0.8,
                    py: 0.35,
                    borderRadius: '6px',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                    },
                  }}
                >
                  Reset
                </Button>
              </Tooltip>
            </Box>

            {/* Close Button */}
            <Tooltip title="Close">
              <IconButton
                onClick={() => setOpen(false)}
                sx={toolbarButtonSx}
                size="small"
              >
                <CloseIcon sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* ========================================
             MAIN CONTENT AREA - Flipbook + Navigation
             ======================================== */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              py: { xs: 2, md: 3 },
              px: { xs: 3, md: 6 },
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.06), transparent 44%)',
                pointerEvents: 'none',
              }}
            />
            {/* Loading Spinner */}
            {loading && <CircularProgress sx={{ color: APP_PRIMARY_COLOR }} />}

            {/* Error Message */}
            {!loading && !!error && (
              <Box sx={{ textAlign: 'center', color: APP_LIGHT_TEXT, px: 2 }}>
                <Typography sx={{ mb: 1 }}>{error}</Typography>
                <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ color: APP_PRIMARY_COLOR }}>
                  Download PDF directly
                </a>
              </Box>
            )}

            {/* Flipbook Container */}
            {!loading && !error && pages.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <Tooltip title="Previous Page">
                  <span>
                    <IconButton
                      onClick={handlePrevPage}
                      disabled={currentPage <= 0}
                      size="small"
                      sx={{
                        position: 'absolute',
                        left: { xs: 2, sm: 8 },
                        zIndex: 10,
                        color: '#fff',
                        bgcolor: 'rgba(22,22,22,0.78)',
                        border: `1px solid ${TOOLBAR_BORDER}`,
                        width: { xs: 36, sm: 42 },
                        height: { xs: 36, sm: 42 },
                        '&:hover': {
                          bgcolor: APP_PRIMARY_COLOR,
                        },
                        '&:disabled': {
                          color: 'rgba(255,255,255,0.24)',
                          bgcolor: 'rgba(22,22,22,0.42)',
                        },
                      }}
                    >
                      <ArrowBackIcon sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' } }} />
                    </IconButton>
                  </span>
                </Tooltip>

                {/* HTMLFlipBook - Main Viewer */}
                <Box
                  sx={{
                    width: bookShellWidth,
                    height: bookShellHeight,
                    flex: '0 0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `scale(${zoomLevel / 100})`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.3s ease',
                    filter: 'drop-shadow(0 24px 36px rgba(0,0,0,0.52))',
                    '& .stf__parent': {
                      margin: '0 auto',
                    },
                    '& .stf__block': {
                      margin: '0 auto',
                    },
                  }}
                >
                  <HTMLFlipBook
                    ref={flipBookRef}
                    width={bookSize.width}
                    height={bookSize.height}
                    size="fixed"
                    minWidth={280}
                    maxWidth={1280}
                    minHeight={380}
                    maxHeight={1600}
                    maxShadowOpacity={0.6}
                    showCover={true}
                    mobileScrollSupport={true}
                    usePortrait={bookSize.isMobile}
                    startPage={0}
                    drawShadow
                    flippingTime={soundEnabled ? 700 : 300}
                    onFlip={handleFlip}
                    onInit={handleBookInit}
                  >
                    {pages.map((src, index) => (
                      <div
                        key={`page-${index}`}
                        style={{
                          background: '#fff',
                          width: '100%',
                          height: '100%',
                          overflow: 'hidden',
                          position: 'relative',
                          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
                        }}
                      >
                        {/* Left half - click to go to previous page */}
                        <div
                          onClick={() => {
                            if (index > 0) handlePageRegionClick('prev');
                          }}
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: '30%',
                            height: '100%',
                            cursor: index > 0 ? 'pointer' : 'default',
                            zIndex: 5,
                          }}
                        />
                        
                        {/* Right half - click to go to next page */}
                        <div
                          onClick={() => {
                            if (index < pages.length - 1) handlePageRegionClick('next');
                          }}
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            width: '30%',
                            height: '100%',
                            cursor: index < pages.length - 1 ? 'pointer' : 'default',
                            zIndex: 5,
                          }}
                        />

                        {/* Page Image */}
                        <img
                          src={src}
                          alt={`Brochure page ${index + 1}`}
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'block',
                            objectFit: 'fill',
                            pointerEvents: 'none',
                          }}
                        />
                      </div>
                    ))}
                  </HTMLFlipBook>
                </Box>

                <Tooltip title="Next Page">
                  <span>
                    <IconButton
                      onClick={handleNextPage}
                      disabled={currentPage >= pages.length - 1}
                      size="small"
                      sx={{
                        position: 'absolute',
                        right: { xs: 2, sm: 8 },
                        zIndex: 10,
                        color: '#fff',
                        bgcolor: 'rgba(22,22,22,0.78)',
                        border: `1px solid ${TOOLBAR_BORDER}`,
                        width: { xs: 36, sm: 42 },
                        height: { xs: 36, sm: 42 },
                        '&:hover': {
                          bgcolor: APP_PRIMARY_COLOR,
                        },
                        '&:disabled': {
                          color: 'rgba(255,255,255,0.24)',
                          bgcolor: 'rgba(22,22,22,0.42)',
                        },
                      }}
                    >
                      <ArrowForwardIcon sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' } }} />
                    </IconButton>
                  </span>
                </Tooltip>

                <Box
                  sx={{
                    position: 'absolute',
                    left: { xs: 10, sm: 18 },
                    bottom: { xs: 10, sm: 18 },
                    px: 1.1,
                    py: 0.5,
                    borderRadius: '999px',
                    bgcolor: 'rgba(16,16,16,0.82)',
                    border: `1px solid ${TOOLBAR_BORDER}`,
                    color: 'rgba(255,255,255,0.82)',
                    fontSize: '0.72rem',
                    letterSpacing: 0.3,
                    zIndex: 2,
                  }}
                >
                  {pages.length > 0 ? `Page ${currentPage + 1} of ${pages.length}` : ''}
                </Box>
              </Box>
            )}
          </Box>

          {/* ========================================
             BOTTOM TOOLBAR
             Pages, Search, Bookmarks, Share, More
             ======================================== */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.2,
              px: { xs: 0.8, sm: 1.25 },
              py: 0.7,
              minHeight: 48,
              bgcolor: TOOLBAR_BG,
              borderTop: `1px solid ${TOOLBAR_BORDER}`,
              flexWrap: 'wrap',
              zIndex: 3,
            }}
          >
            {/* Pages / Table of Contents Button */}
            <Tooltip title="Pages">
              <IconButton
                size="small"
                onClick={() => setPagesOpen(true)}
                sx={toolbarButtonSx}
              >
                <ImageGalleryIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} />
              </IconButton>
            </Tooltip>

            {/* Search Button */}
            <Tooltip title="Search">
              <IconButton
                size="small"
                onClick={() => setSearchOpen(true)}
                sx={toolbarButtonSx}
              >
                <SearchIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} />
              </IconButton>
            </Tooltip>

            {/* Bookmark Button */}
            <Tooltip title="Bookmarks">
              <IconButton
                size="small"
                onClick={handleBookmarkDialogOpen}
                sx={bookmarks.has(currentPage) ? activeToolbarButtonSx : toolbarButtonSx}
              >
                {bookmarks.has(currentPage) ? <BookmarkIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} /> : <BookmarkBorderIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} />}
              </IconButton>
            </Tooltip>

            <Tooltip title="Table of Contents">
              <IconButton
                size="small"
                onClick={() => setTocOpen(true)}
                sx={toolbarButtonSx}
              >
                <ListAltIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} />
              </IconButton>
            </Tooltip>

            {/* Share Button */}
            <Tooltip title="Share">
              <IconButton
                size="small"
                onClick={() => setShareOpen(true)}
                sx={toolbarButtonSx}
              >
                <ShareIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} />
              </IconButton>
            </Tooltip>

            <Tooltip title="Print">
              <IconButton
                size="small"
                onClick={handlePrint}
                sx={toolbarButtonSx}
              >
                <PrintIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} />
              </IconButton>
            </Tooltip>

            <Tooltip title="Download PDF">
              <IconButton
                size="small"
                onClick={handleDownloadPdf}
                sx={toolbarButtonSx}
              >
                <GetAppIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} />
              </IconButton>
            </Tooltip>

            <Tooltip title={soundEnabled ? 'Mute Sound' : 'Enable Sound'}>
              <IconButton
                size="small"
                onClick={() => {
                  setSoundEnabled(!soundEnabled);
                  playFlipSound(!soundEnabled);
                }}
                sx={soundEnabled ? activeToolbarButtonSx : toolbarButtonSx}
              >
                {soundEnabled ? <VolumeUpIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} /> : <VolumeOffIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} />}
              </IconButton>
            </Tooltip>

            <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
              <IconButton
                size="small"
                onClick={handleToggleFullscreen}
                sx={isFullscreen ? activeToolbarButtonSx : toolbarButtonSx}
              >
                {isFullscreen ? <FullscreenExitIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} /> : <FullscreenIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} />}
              </IconButton>
            </Tooltip>

            {/* More Menu Button */}
            <Tooltip title="More Options">
              <IconButton
                size="small"
                onClick={() => setMoreOpen(!moreOpen)}
                sx={moreOpen ? activeToolbarButtonSx : toolbarButtonSx}
              >
                <MenuIcon sx={{ fontSize: { xs: '1.1rem', sm: '1.3rem' } }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* More Menu Dropdown */}
          {moreOpen && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 54,
                right: 12,
                minWidth: 190,
                bgcolor: 'rgba(24,24,24,0.98)',
                border: `1px solid ${PANEL_BORDER}`,
                borderRadius: '8px',
                py: 0.6,
                zIndex: 100,
                boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
              }}
            >
              {/* Print Button */}
              <Button
                startIcon={<PrintIcon />}
                fullWidth
                onClick={handlePrint}
                sx={{
                  color: APP_LIGHT_TEXT,
                  justifyContent: 'flex-start',
                  px: 2,
                  py: 0.95,
                  textTransform: 'none',
                  '&:hover': { color: APP_PRIMARY_COLOR, bgcolor: 'rgba(255,255,255,0.05)' },
                }}
              >
                Print
              </Button>

              {/* Download Button */}
              <Button
                startIcon={<ImageGalleryIcon />}
                fullWidth
                onClick={handleDownloadCurrentPage}
                sx={{
                  color: APP_LIGHT_TEXT,
                  justifyContent: 'flex-start',
                  px: 2,
                  py: 0.95,
                  textTransform: 'none',
                  '&:hover': { color: APP_PRIMARY_COLOR, bgcolor: 'rgba(255,255,255,0.05)' },
                }}
              >
                Download Page
              </Button>

              <Button
                startIcon={<GetAppIcon />}
                fullWidth
                onClick={handleDownloadPdf}
                sx={{
                  color: APP_LIGHT_TEXT,
                  justifyContent: 'flex-start',
                  px: 2,
                  py: 0.95,
                  textTransform: 'none',
                  '&:hover': { color: APP_PRIMARY_COLOR, bgcolor: 'rgba(255,255,255,0.05)' },
                }}
              >
                Download PDF
              </Button>

              {/* Sound Toggle Button */}
              <Button
                startIcon={soundEnabled ? <VolumeUpIcon /> : <VolumeOffIcon />}
                fullWidth
                onClick={() => {
                  setSoundEnabled(!soundEnabled);
                  // Test sound on toggle
                  playFlipSound(!soundEnabled);
                }}
                sx={{
                  color: APP_LIGHT_TEXT,
                  justifyContent: 'flex-start',
                  px: 2,
                  py: 0.95,
                  textTransform: 'none',
                  '&:hover': { color: APP_PRIMARY_COLOR, bgcolor: 'rgba(255,255,255,0.05)' },
                }}
              >
                {soundEnabled ? 'Sound On' : 'Sound Off'}
              </Button>
            </Box>
          )}
        </Box>
      </Modal>

      {/* ========================================
         PAGES / TABLE OF CONTENTS DIALOG
         ======================================== */}
      <Dialog
        open={pagesOpen}
        onClose={() => setPagesOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: darkDialogPaperSx }}
      >
        <DialogTitle sx={{ bgcolor: '#252525', color: APP_LIGHT_TEXT, borderBottom: `1px solid ${PANEL_BORDER}` }}>
          Pages
        </DialogTitle>
        <DialogContent sx={{ maxHeight: '70vh', overflow: 'auto', py: 2, bgcolor: '#181818' }}>
          <Grid container spacing={2}>
            {pages.map((src, index) => (
              <Grid item xs={6} sm={4} md={3} key={index}>
                <Box
                  onClick={() => handleGoToPage(index)}
                  sx={{
                    cursor: 'pointer',
                    position: 'relative',
                    border: currentPage === index ? `1px solid ${APP_PRIMARY_COLOR}` : `1px solid ${PANEL_BORDER}`,
                    borderRadius: '8px',
                    overflow: 'hidden',
                    aspectRatio: '0.7',
                    bgcolor: '#0e0e0e',
                    boxShadow: currentPage === index ? '0 0 0 2px rgba(240,84,35,0.18)' : 'none',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 14px 30px rgba(0,0,0,0.34)',
                    },
                  }}
                >
                  {/* Thumbnail Image */}
                  <img
                    src={src}
                    alt={`Page ${index + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                  
                  {/* Page Number Label */}
                  <Box
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      bgcolor: currentPage === index ? APP_PRIMARY_COLOR : 'rgba(12,12,12,0.78)',
                      color: '#fff',
                      textAlign: 'center',
                      py: 0.5,
                      fontWeight: 600,
                      fontSize: '0.8rem',
                    }}
                  >
                    Page {index + 1}
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
      </Dialog>

      <Dialog
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: darkDialogPaperSx }}
      >
        <DialogTitle sx={{ bgcolor: '#252525', color: APP_LIGHT_TEXT, borderBottom: `1px solid ${PANEL_BORDER}` }}>
          Table of Contents
        </DialogTitle>
        <DialogContent sx={{ py: 2, bgcolor: '#181818' }}>
          <Grid container spacing={1}>
            {pages.map((_, index) => (
              <Grid item xs={12} key={`toc-${index}`}>
                <Button
                  fullWidth
                  onClick={() => {
                    handleGoToPage(index);
                    setTocOpen(false);
                  }}
                  sx={{
                    justifyContent: 'space-between',
                    borderLeft: currentPage === index ? `4px solid ${APP_PRIMARY_COLOR}` : '4px solid transparent',
                    color: APP_LIGHT_TEXT,
                    bgcolor: 'rgba(255,255,255,0.02)',
                    borderRadius: '8px',
                    textTransform: 'none',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.06)',
                    },
                  }}
                >
                  <span>{`Section ${index + 1}`}</span>
                  <span>{`Page ${index + 1}`}</span>
                </Button>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
      </Dialog>

      {/* ========================================
         SEARCH DIALOG
         ======================================== */}
      <Dialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: darkDialogPaperSx }}
      >
        <DialogTitle sx={{ bgcolor: '#252525', color: APP_LIGHT_TEXT, borderBottom: `1px solid ${PANEL_BORDER}` }}>
          Search in Document
        </DialogTitle>
        <DialogContent sx={{ py: 2, bgcolor: '#181818' }}>
          <TextField
            fullWidth
            placeholder="Enter search term..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            InputProps={{
              sx: {
                color: APP_LIGHT_TEXT,
                bgcolor: '#101010',
                borderRadius: '8px',
                '& input::placeholder': {
                  color: 'rgba(255,255,255,0.42)',
                  opacity: 1,
                },
              },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={handleSearch}
                    edge="end"
                    sx={{ color: 'rgba(255,255,255,0.7)' }}
                  >
                    <SearchIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{
              mt: 1,
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: PANEL_BORDER,
              },
              '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255,255,255,0.24)',
              },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: APP_PRIMARY_COLOR,
              },
            }}
          />

          {searchResults.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontWeight: 600, mb: 1, color: 'rgba(255,255,255,0.88)' }}>
                Found in {searchResults.length} page(s):
              </Typography>
              <Grid container spacing={1}>
                {searchResults.map((pageNum) => (
                  <Grid item xs={4} key={pageNum}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => goToSearchResult(pageNum)}
                      fullWidth
                      sx={{
                        borderColor: APP_PRIMARY_COLOR,
                        color: APP_PRIMARY_COLOR,
                        bgcolor: 'rgba(255,255,255,0.02)',
                        '&:hover': {
                          bgcolor: `${APP_PRIMARY_COLOR}1c`,
                        },
                      }}
                    >
                      Page {pageNum + 1}
                    </Button>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================
         BOOKMARKS DIALOG
         ======================================== */}
      <Dialog
        open={bookmarkOpen}
        onClose={() => setBookmarkOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: darkDialogPaperSx }}
      >
        <DialogTitle sx={{ bgcolor: '#252525', color: APP_LIGHT_TEXT, borderBottom: `1px solid ${PANEL_BORDER}` }}>
          Bookmarks
        </DialogTitle>
        <DialogContent sx={{ py: 2, bgcolor: '#181818' }}>
          <Button
            fullWidth
            variant="outlined"
            onClick={toggleBookmark}
            sx={{
              mb: 2,
              borderColor: APP_PRIMARY_COLOR,
              color: APP_PRIMARY_COLOR,
              textTransform: 'none',
              '&:hover': {
                borderColor: APP_PRIMARY_COLOR,
                bgcolor: `${APP_PRIMARY_COLOR}12`,
              },
            }}
          >
            {bookmarks.has(currentPage) ? `Remove Current Page (${currentPage + 1}) Bookmark` : `Add Current Page (${currentPage + 1}) Bookmark`}
          </Button>

          {bookmarks.size === 0 ? (
            <Typography sx={{ color: 'rgba(255,255,255,0.54)' }}>
              No bookmarks yet. Use the button above to save the current page.
            </Typography>
          ) : (
            <Grid container spacing={1}>
              {Array.from(bookmarks)
                .sort((a, b) => a - b)
                .map((pageNum) => (
                  <Grid item xs={12} key={pageNum}>
                    <Button
                      fullWidth
                      onClick={() => goToBookmark(pageNum)}
                      sx={{
                        justifyContent: 'flex-start',
                        borderLeft: `4px solid ${APP_PRIMARY_COLOR}`,
                        pl: 2,
                        color: APP_LIGHT_TEXT,
                        bgcolor: 'rgba(255,255,255,0.02)',
                        borderRadius: '8px',
                        textTransform: 'none',
                        '&:hover': {
                          bgcolor: 'rgba(255,255,255,0.06)',
                        },
                      }}
                    >
                      Bookmarked Page {pageNum + 1}
                    </Button>
                  </Grid>
                ))}
            </Grid>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================
         SHARE DIALOG
         ======================================== */}
      <Dialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: darkDialogPaperSx }}
      >
        <DialogTitle sx={{ bgcolor: '#252525', color: APP_LIGHT_TEXT, borderBottom: `1px solid ${PANEL_BORDER}` }}>
          Share This Brochure
        </DialogTitle>
        <DialogContent sx={{ py: 2, bgcolor: '#181818' }}>
          <TextField
            fullWidth
            value={shareUrl}
            readOnly
            InputProps={{
              sx: {
                color: APP_LIGHT_TEXT,
                bgcolor: '#101010',
                borderRadius: '8px',
              },
              endAdornment: (
                <InputAdornment position="end">
                  <Button
                    onClick={handleCopyShareLink}
                    sx={{
                      color: APP_PRIMARY_COLOR,
                      textTransform: 'none',
                    }}
                  >
                    Copy
                  </Button>
                </InputAdornment>
              ),
            }}
            sx={{
              mt: 1,
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: PANEL_BORDER,
              },
            }}
          />
          <Typography sx={{ mt: 2, fontSize: '0.85rem', color: 'rgba(255,255,255,0.54)' }}>
            Share the link above with others to view this brochure
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default FlipbookViewer;
