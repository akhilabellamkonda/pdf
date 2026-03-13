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
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// ========================================
// CONFIGURATION & CONSTANTS
// ========================================

const STATIC_PDF_URL = '/propertyfish.pdf';
const PDF_WORKER_URL = pdfWorkerUrl;
const APP_PRIMARY_COLOR = '#F05423'; // Orange from your app
const APP_DARK_BG = '#1a1a1a';
const APP_LIGHT_TEXT = '#ffffff';
const TOOLBAR_BG = 'rgba(28, 28, 28, 0.94)';
const TOOLBAR_BORDER = 'rgba(255, 255, 255, 0.08)';
const PANEL_BG = '#1f1f1f';
const PANEL_BORDER = 'rgba(255,255,255,0.12)';
const PAGE_FLIP_AUDIO_URL = '/flipsound.mpeg';
const BOOK_PAGE_EDGE = 'rgba(58, 39, 20, 0.12)';
const BOOK_GUTTER_SHADOW = 'rgba(0, 0, 0, 0.18)';
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
    const availableWidth = Math.floor(vw * 0.985);
    const availableHeight = Math.floor(vh * 0.86);
    const pageWidth = Math.max(280, Math.floor(Math.min(availableWidth, availableHeight / safeAspectRatio)));
    const pageHeight = Math.floor(pageWidth * safeAspectRatio);
    return { width: pageWidth, height: pageHeight, isMobile };
  }

  const availablePageWidth = Math.floor(vw * (vw < 1200 ? 0.9 : 0.82));
  const availablePageHeight = Math.floor(vh * 0.91);
  const pageWidth = Math.max(440, Math.floor(Math.min(availablePageWidth, availablePageHeight / safeAspectRatio)));
  const pageHeight = Math.floor(pageWidth * safeAspectRatio);
  return { width: pageWidth, height: pageHeight, isMobile };
};

const getVisiblePageLabel = ({ currentPage, totalPages, isMobile, forceSinglePageView }) => {
  if (!totalPages) {
    return 'Loading';
  }

  const pageNumber = currentPage + 1;
  const useSinglePage = isMobile || forceSinglePageView;
  const isCoverPage = pageNumber === 1 || pageNumber === totalPages;

  if (useSinglePage || isCoverPage) {
    return `${pageNumber} / ${totalPages}`;
  }

  const nextPage = Math.min(pageNumber + 1, totalPages);
  return `${pageNumber}-${nextPage} / ${totalPages}`;
};

/**
 * FlipbookViewer - Premium PDF flipbook with full toolbar controls
 * Features: zoom, search, pages, bookmarks, share, print, download, sound
 */
const FlipbookViewer = ({ pdfUrl = STATIC_PDF_URL, buttonLabel = null, startOpen = true }) => {
  // ========================================
  // STATE MANAGEMENT
  // ========================================

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pages, setPages] = useState([]);
  const [totalPageCount, setTotalPageCount] = useState(0);
  const [pageAspectRatio, setPageAspectRatio] = useState(1.414);
  const [bookSize, setBookSize] = useState(() => getViewportSize(1.414));

  const [currentPage, setCurrentPage] = useState(0);

  // Search & Filter state
  const viewMode = 'flipbook';

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
  const pageObjectUrlsRef = useRef([]);

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

  const flipToPage = useCallback((targetPage) => {
    if (!flipBookRef.current || targetPage < 0 || targetPage >= pages.length) {
      return;
    }

    flipBookRef.current.pageFlip().flip(targetPage, 'top');
  }, [pages.length]);

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
      pageObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      pageObjectUrlsRef.current = [];
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

      flipToPage(currentIndex + 1);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [open, isAutoplaying, pages.length, currentPage, flipToPage]);

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

  const renderPdfPageToUrl = useCallback(async (page, targetBookWidth) => {
    const baseViewport = page.getViewport({ scale: 1 });
    const deviceScale = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.6) : 1;
    const targetWidth = Math.max(2200, Math.min(4400, Math.floor(targetBookWidth * 3.55 * deviceScale)));
    const scale = Math.max(2.5, Math.min(4.1, targetWidth / baseViewport.width));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });

    if (!context) {
      throw new Error('Canvas 2D context unavailable');
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    await page.render({
      canvasContext: context,
      viewport,
      background: 'rgb(255,255,255)',
    }).promise;

    const pageBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error('Canvas export failed'));
      }, 'image/png');
    });

    const pageUrl = URL.createObjectURL(pageBlob);
    pageObjectUrlsRef.current.push(pageUrl);

    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 1;
    canvas.height = 1;

    return { pageUrl, baseViewport };
  }, []);

  /**
   * Load PDF and progressively render pages so the cover appears immediately.
   */
  const loadPdfPages = useCallback(async () => {
    if (!pdfUrl) return;
    setLoading(true);
    setError('');

    try {
      pageObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      pageObjectUrlsRef.current = [];

      // Dynamic import of PDF.js library
      const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        withCredentials: false,
      });

      pdfTaskRef.current = loadingTask;
      const pdf = await loadingTask.promise;
      setTotalPageCount(pdf.numPages);
      const firstPage = await pdf.getPage(1);
      const firstRender = await renderPdfPageToUrl(firstPage, bookSize.width);
      const nextAspectRatio = firstRender.baseViewport.height / firstRender.baseViewport.width;
      setPageAspectRatio(nextAspectRatio);
      setBookSize(getViewportSize(nextAspectRatio));

      const initialPages = Array.from({ length: pdf.numPages }, (_, index) => (index === 0 ? firstRender.pageUrl : ''));
      if (!mountedRef.current) return;
      loadedUrlRef.current = pdfUrl;
      setPages(initialPages);
      setLoading(false);

      for (let pageNumber = 2; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (!mountedRef.current) return;
        const page = await pdf.getPage(pageNumber);
        const { pageUrl } = await renderPdfPageToUrl(page, bookSize.width);

        if (!mountedRef.current) return;
        setPages((prev) => {
          const next = [...prev];
          next[pageNumber - 1] = pageUrl;
          return next;
        });
      }

      return;
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
  }, [bookSize.width, pdfUrl, renderPdfPageToUrl]);

  const loadPdfMeta = useCallback(async () => {
    if (!pdfUrl) return;

    try {
      const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        withCredentials: false,
      });
      const pdf = await loadingTask.promise;
      if (mountedRef.current) {
        setTotalPageCount(pdf.numPages);
      }
      await loadingTask.destroy();
    } catch (e) {
      console.debug('PDF metadata load failed', e);
    }
  }, [pdfUrl]);

  /**
   * Open flipbook modal and load PDF if not already loaded
   */
  const onOpen = async () => {
    setOpen(true);
    setCurrentPage(0);
    getFlipAudio();
    if (!totalPageCount) {
      await loadPdfMeta();
    }
    if (loadedUrlRef.current !== pdfUrl || pages.length === 0) {
      await loadPdfPages();
    }
  };

  useEffect(() => {
    if (startOpen) {
      onOpen();
    }
  }, [startOpen]);

  // ========================================
  // PAGE NAVIGATION
  // ========================================

  /**
   * Go to previous page
   * Updates state manually since turnToPrevPage doesn't always trigger onChangePage
   */
  const handlePrevPage = () => {
    if (flipBookRef.current && currentPage > 0) {
      flipToPage(currentPage - 1);
    }
  };

  const handleFirstPage = () => {
    if (flipBookRef.current && pages.length > 0) {
      flipToPage(0);
      setCurrentPage(0);
    }
  };

  /**
   * Go to next page
   * Updates state manually since turnToNextPage doesn't always trigger onChangePage
   */
  const handleNextPage = () => {
    if (flipBookRef.current && currentPage < pages.length - 1) {
      flipToPage(currentPage + 1);
    }
  };

  const handleLastPage = () => {
    if (flipBookRef.current && pages.length > 0) {
      const lastPageIndex = pages.length - 1;
      flipToPage(lastPageIndex);
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
      flipToPage(pageNum);
      setCurrentPage(pageNum);
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

  const forceSinglePageView = true;
  const bookShellWidth = `${Math.round(bookSize.width)}px`;
  const bookShellHeight = `${Math.round(bookSize.height)}px`;
  const isCoverPresentation = !bookSize.isMobile && (currentPage === 0 || currentPage === pages.length - 1);
  const visiblePageLabel = getVisiblePageLabel({
    currentPage,
    totalPages: totalPageCount || pages.length,
    isMobile: bookSize.isMobile,
    forceSinglePageView,
  });

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
      {buttonLabel && (
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
      )}

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
              justifyContent: 'center',
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
            <Box sx={{ display: 'flex', gap: 0.2, alignItems: 'center', bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${TOOLBAR_BORDER}`, borderRadius: '8px', px: 0.35, py: 0.25 }}>
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
            </Box>
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
              py: { xs: 0.5, md: 0.75 },
              px: { xs: 0.5, md: 1 },
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
                    position: 'relative',
                    transform: isCoverPresentation ? 'scale(0.95)' : 'scale(1)',
                    transition: 'transform 360ms ease, width 360ms ease, height 360ms ease',
                    filter: isCoverPresentation
                      ? 'drop-shadow(0 18px 26px rgba(0,0,0,0.36))'
                      : 'drop-shadow(0 26px 38px rgba(0,0,0,0.56))',
                    '& .stf__parent': {
                      margin: '0 auto',
                    },
                    '& .stf__block': {
                      margin: '0 auto',
                    },
                    '& .stf__wrapper': {
                      filter: forceSinglePageView
                        ? 'drop-shadow(0 22px 24px rgba(0,0,0,0.28))'
                        : 'drop-shadow(0 28px 34px rgba(0,0,0,0.46))',
                    },
                    '& .stf__item': {
                      backgroundColor: '#fefefe',
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
                    maxShadowOpacity={0.95}
                    showCover={true}
                    mobileScrollSupport={true}
                    usePortrait={true}
                    startPage={0}
                    startZIndex={10}
                    drawShadow
                    flippingTime={soundEnabled ? 1000 : 700}
                    showPageCorners={!bookSize.isMobile}
                    clickEventForward={false}
                    onFlip={handleFlip}
                    onInit={handleBookInit}
                  >
                    {pages.map((src, index) => (
                      (() => {
                        const isCoverPage = index === 0 || index === pages.length - 1;
                        const useBookSurface = forceSinglePageView && !bookSize.isMobile && index !== 0 && index !== pages.length - 1;
                        return (
                      <div
                        key={`page-${index}`}
                        style={{
                          background: '#fff',
                          width: '100%',
                          height: '100%',
                          overflow: 'hidden',
                          position: 'relative',
                          borderRadius: useBookSurface ? '4px' : '0',
                          boxShadow: useBookSurface
                            ? 'inset 0 0 0 1px rgba(0,0,0,0.04)'
                            : 'inset 0 0 0 1px rgba(0,0,0,0.06)',
                          backgroundImage: useBookSurface
                            ? [
                                'radial-gradient(ellipse at 33% 50%, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 56%, rgba(0,0,0,0.075) 100%)',
                                'radial-gradient(ellipse at 67% 50%, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 56%, rgba(0,0,0,0.075) 100%)',
                                'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 43%, rgba(0,0,0,0.14) 48.2%, rgba(255,255,255,0.38) 50%, rgba(0,0,0,0.14) 51.8%, rgba(255,255,255,0) 57%, rgba(255,255,255,0) 100%)',
                              ].join(', ')
                            : isCoverPage
                              ? 'none'
                            : index % 2 === 0
                              ? `linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 93%, ${BOOK_PAGE_EDGE} 100%)`
                              : `linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 93%, ${BOOK_PAGE_EDGE} 100%)`,
                        }}
                      >
                        {!isCoverPage && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: useBookSurface ? '50%' : undefined,
                              transform: useBookSurface ? 'translateX(-50%)' : undefined,
                              [!useBookSurface ? (index % 2 === 0 ? 'left' : 'right') : 'left']: !useBookSurface ? 0 : undefined,
                              width: useBookSurface ? '22px' : '18px',
                              background: useBookSurface
                                ? 'linear-gradient(to right, transparent, rgba(0,0,0,0.1), rgba(255,255,255,0.24), rgba(0,0,0,0.1), transparent)'
                                : index % 2 === 0
                                  ? `linear-gradient(to right, ${BOOK_GUTTER_SHADOW}, rgba(0,0,0,0.05), transparent)`
                                  : `linear-gradient(to left, ${BOOK_GUTTER_SHADOW}, rgba(0,0,0,0.05), transparent)`,
                              pointerEvents: 'none',
                              zIndex: 2,
                            }}
                          />
                        )}

                        {useBookSurface && (
                          <>
                            <div
                              style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: 0,
                                width: '50%',
                                background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 22%, rgba(0,0,0,0.055) 100%)',
                                pointerEvents: 'none',
                                zIndex: 1,
                              }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                right: 0,
                                width: '50%',
                                background: 'linear-gradient(to left, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 22%, rgba(0,0,0,0.055) 100%)',
                                pointerEvents: 'none',
                                zIndex: 1,
                              }}
                            />
                          </>
                        )}

                        {/* Left half - click to go to previous page */}
                        <div
                          onClick={() => {
                            if (index > 0) handlePageRegionClick('prev');
                          }}
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: '18%',
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
                            width: '18%',
                            height: '100%',
                            cursor: index < pages.length - 1 ? 'pointer' : 'default',
                            zIndex: 5,
                          }}
                        />

                        {/* Page Image */}
                        {useBookSurface ? (
                          <>
                            <div
                              style={{
                                position: 'absolute',
                                left: '0.4%',
                                top: 0,
                                width: '49.6%',
                                height: '100%',
                                overflow: 'hidden',
                                zIndex: 0,
                                transformOrigin: 'right center',
                                transform: 'perspective(2600px) rotateY(2.6deg) scaleX(0.998)',
                                backfaceVisibility: 'hidden',
                              }}
                            >
                              <img
                                src={src}
                                alt={`Brochure page ${index + 1} left`}
                                loading="lazy"
                                style={{
                                  width: '200%',
                                  height: '100%',
                                  display: 'block',
                                  objectFit: 'fill',
                                  objectPosition: 'left center',
                                  imageRendering: 'auto',
                                  pointerEvents: 'none',
                                  filter: 'brightness(0.992)',
                                }}
                              />
                            </div>
                            <div
                              style={{
                                position: 'absolute',
                                right: '0.4%',
                                top: 0,
                                width: '49.6%',
                                height: '100%',
                                overflow: 'hidden',
                                zIndex: 0,
                                transformOrigin: 'left center',
                                transform: 'perspective(2600px) rotateY(-2.6deg) scaleX(0.998)',
                                backfaceVisibility: 'hidden',
                              }}
                            >
                              <img
                                src={src}
                                alt={`Brochure page ${index + 1} right`}
                                loading="lazy"
                                style={{
                                  width: '200%',
                                  height: '100%',
                                  display: 'block',
                                  objectFit: 'fill',
                                  objectPosition: 'right center',
                                  imageRendering: 'auto',
                                  pointerEvents: 'none',
                                  transform: 'translateX(-50%)',
                                  filter: 'brightness(0.992)',
                                }}
                              />
                            </div>
                          </>
                        ) : (
                          <img
                            src={src}
                            alt={`Brochure page ${index + 1}`}
                            loading="lazy"
                            style={{
                              width: '100%',
                              height: '100%',
                              display: 'block',
                              objectFit: 'fill',
                              imageRendering: 'auto',
                              pointerEvents: 'none',
                              position: 'relative',
                              zIndex: 1,
                            }}
                          />
                        )}
                      </div>
                        );
                      })()
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
                  {pages.length > 0 ? `Pages ${visiblePageLabel}` : ''}
                </Box>
              </Box>
            )}
          </Box>

        </Box>
      </Modal>
    </Box>
  );
};

export default FlipbookViewer;
