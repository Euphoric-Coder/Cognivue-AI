"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, RefreshCw, FileText, Image as ImageIcon, Play, Search, Eye, Table as TableIcon, BarChart3, Network, Camera, Layers, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatSlideNumber, formatTimestamp } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export default function SourceDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const sourceId = params.sourceId;
  const courseId = params.courseId;

  const source = useQuery(api.sources.getSource, { sourceId });
  const chunks = useQuery(api.sources.getSourceChunks, { sourceId });
  const segments = useQuery(api.sources.getTranscriptSegments, source?.type === 'video' ? { sourceId } : "skip");
  const visuals = useQuery(api.sources.getSourceVisuals, { sourceId });
  
  const [activeTab, setActiveTab] = useState("content"); // "content" | "visuals"
  const [visualTypeFilter, setVisualTypeFilter] = useState("all");
  const [selectedVisual, setSelectedVisual] = useState(null);

  const [selectedLoc, setSelectedLoc] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const videoRef = useRef(null);
  const segmentRefs = useRef({});

  useEffect(() => {
    if (autoScroll && activeSegmentId && segmentRefs.current[activeSegmentId]) {
      segmentRefs.current[activeSegmentId].scrollIntoView({
        block: "nearest",
        behavior: "smooth"
      });
    }
  }, [activeSegmentId, autoScroll]);

  if (source === undefined || chunks === undefined) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!source) {
    return <div className="p-8 text-center text-muted-foreground">Source not found.</div>;
  }

  const handleRetry = async () => {
    toast("Restarting processing pipeline...");
    try {
      await fetch("/api/ingestion/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: source._id,
          courseId: courseId,
          fileUrl: source.fileUrl,
          mimeType: source.mimeType,
          originalFileName: source.originalFileName
        })
      });
    } catch (e) {
      toast.error("Failed to trigger processing.");
    }
  };

  const handleSeek = (time) => {
    if (videoRef.current) {
      const seekTo = Math.max(0, time);
      if (videoRef.current.readyState >= 1) {
        if (videoRef.current.duration) {
          videoRef.current.currentTime = Math.min(seekTo, videoRef.current.duration);
        } else {
          videoRef.current.currentTime = seekTo;
        }
        videoRef.current.play().catch(e => console.log("Play failed", e));
      } else {
        const onLoaded = () => {
          if (videoRef.current.duration) {
            videoRef.current.currentTime = Math.min(seekTo, videoRef.current.duration);
          } else {
            videoRef.current.currentTime = seekTo;
          }
          videoRef.current.play().catch(e => console.log("Play failed", e));
          videoRef.current.removeEventListener("loadedmetadata", onLoaded);
        };
        videoRef.current.addEventListener("loadedmetadata", onLoaded);
      }
    }
  };

  const isFailed = source.status === 'failed';
  const isReady = source.status === 'ready';
  const isProcessing = ['queued', 'extracting', 'normalizing', 'chunking'].includes(source.status);
  const isVideo = source.type === 'video';
  
  // Group chunks by location (page or slide)
  const locChunks = {};
  if (!isVideo) {
    chunks.forEach(chunk => {
      const loc = chunk.pageNumber || formatSlideNumber(chunk.slideNumber) || "Unknown";
      if (!locChunks[loc]) locChunks[loc] = [];
      locChunks[loc].push(chunk);
    });
  }
  
  const locs = Object.keys(locChunks).map(Number).sort((a,b)=>a-b);
  const currentLoc = selectedLoc || (locs.length > 0 ? locs[0] : null);

  const locType = source.type === 'pdf' ? 'Page' : source.type === 'pptx' ? 'Slide' : 'Video';

  const filteredSegments = segments?.filter(seg => seg.text.toLowerCase().includes(searchQuery.toLowerCase())) || [];

  const handleTimeUpdate = () => {
    if (!videoRef.current || !segments) return;
    const time = videoRef.current.currentTime;
    
    // Find active segment
    const active = segments.find(seg => time >= seg.startTime && time < seg.endTime);
    if (active && active._id !== activeSegmentId) {
      setActiveSegmentId(active._id);
    } else if (!active && activeSegmentId) {
      setActiveSegmentId(null);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{source.name}</h1>
          <p className="text-sm text-muted-foreground">{source.originalFileName}</p>
        </div>
        
        {isFailed && (
          <Button onClick={handleRetry} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry Processing
          </Button>
        )}

        {isReady && (
          <div className="flex items-center gap-2">
            {isVideo && (
              <Button 
                onClick={async () => {
                  toast("Rebuilding AI Index...");
                  try {
                    await fetch("/api/ingestion/rebuild_video_index", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        sourceId: source._id,
                        courseId: courseId
                      })
                    });
                    toast.success("Rebuild process queued!");
                  } catch (e) {
                    toast.error("Failed to trigger index rebuild.");
                  }
                }} 
                variant="outline" 
                size="sm"
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Rebuild Text Index
              </Button>
            )}

            <Button
              onClick={async () => {
                toast("Reprocessing visual analysis...");
                try {
                  const res = await fetch("/api/ingestion/reprocess_visuals", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sourceId: source._id,
                      courseId: courseId
                    })
                  });
                  if (res.ok) {
                    toast.success("Visual analysis queued!");
                  } else {
                    toast.error("Failed to queue visual analysis.");
                  }
                } catch (e) {
                  toast.error("Failed to reprocess visuals.");
                }
              }}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <ImageIcon className="w-4 h-4" />
              Reprocess Visuals
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="col-span-1 border-white/10 bg-card/50">
          <CardContent className="p-6 space-y-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Text Processing</p>
              <Badge variant="outline" className={
                isReady ? 'border-green-500 text-green-600' :
                isProcessing ? 'border-blue-500 text-blue-600' :
                isFailed ? 'border-red-500 text-red-600' :
                'border-muted-foreground/30 text-muted-foreground'
              }>
                {source.status === 'failed' && source.processingError === 'Needs OCR' ? 'Needs OCR' : source.status}
              </Badge>
              {isProcessing && (
                <div className="mt-2 text-sm text-muted-foreground">
                  {source.processingStage} • {source.processingProgress}%
                </div>
              )}
              {isFailed && (
                <div className="mt-2 text-sm text-red-500">
                  {source.processingError}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Visual Understanding</p>
              <Badge variant="outline" className={
                source.visualStatus === 'ready' ? 'border-emerald-500 text-emerald-500' :
                source.visualStatus === 'processing' ? 'border-amber-500 text-amber-500' :
                source.visualStatus === 'failed' ? 'border-red-500 text-red-500' :
                'border-muted-foreground/30 text-muted-foreground'
              }>
                {source.visualStatus === 'ready' ? `Visuals Ready (${visuals?.length || source.visualCount || 0})` :
                 source.visualStatus === 'processing' ? 'Analyzing Visuals...' :
                 source.visualStatus === 'failed' ? 'Visuals Failed' : 'Not Started'}
              </Badge>
              {source.visualStatus === 'failed' && source.visualError && (
                <p className="mt-1 text-xs text-red-400">{source.visualError}</p>
              )}
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Type</p>
              <p className="text-sm font-medium uppercase">{source.type}</p>
            </div>

            {isReady && (
              <>
                {!isVideo && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">{locType}s</p>
                    <p className="text-sm font-medium">{source.pageCount || source.slideCount || 0}</p>
                  </div>
                )}
                {isVideo && (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase mb-1">Duration</p>
                      <p className="text-sm font-medium">{formatTimestamp(source.durationSeconds)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase mb-1">Transcript Segments</p>
                      <p className="text-sm font-medium">{source.transcriptSegmentCount || 0}</p>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">AI Search / Chunks</p>
                  <p className="text-sm font-medium">{source.chunkCount || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Processed</p>
                  <p className="text-sm font-medium">{source.processedAt ? formatDistanceToNow(source.processedAt, { addSuffix: true }) : 'N/A'}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="col-span-1 md:col-span-3 flex flex-col space-y-4">
          {/* Tab Switcher */}
          {isReady && (
            <div className="flex items-center gap-2 border-b pb-3">
              <Button
                variant={activeTab === "content" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("content")}
                className="gap-2"
              >
                <FileText className="w-4 h-4" />
                {isVideo ? "Video & Transcript" : "Extracted Content"}
              </Button>
              <Button
                variant={activeTab === "visuals" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("visuals")}
                className="gap-2"
              >
                <ImageIcon className="w-4 h-4" />
                Visuals Gallery
                {visuals && visuals.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
                    {visuals.length}
                  </Badge>
                )}
              </Button>
            </div>
          )}

          {!isReady && !isFailed && !isProcessing && (
            <div className="border border-white/5 rounded-xl p-12 text-center text-muted-foreground">
              Processing status unknown or pending...
            </div>
          )}
          
          {isProcessing && (
            <div className="border border-white/5 rounded-xl p-12 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Processing {source.name}...</p>
            </div>
          )}
          
          {isFailed && (
            <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-12 flex flex-col items-center justify-center space-y-4">
              <p className="text-red-500 font-medium">Processing failed</p>
              <p className="text-sm text-muted-foreground max-w-md text-center">{source.processingError || "The document could not be processed."}</p>
              <Button onClick={handleRetry} variant="default" className="mt-4">Retry Processing</Button>
            </div>
          )}

          {/* Tab 1: Extracted Content / Transcript */}
          {isReady && activeTab === "content" && !isVideo && chunks.length > 0 && currentLoc !== null && (
            <div className="border border-white/10 rounded-xl overflow-hidden flex flex-col h-[600px] bg-card/30">
              <div className="flex border-b border-white/10 p-2 gap-2 overflow-x-auto">
                {locs.map(loc => (
                  <Button 
                    key={loc} 
                    variant={currentLoc === loc ? "secondary" : "ghost"} 
                    size="sm" 
                    onClick={() => setSelectedLoc(loc)}
                    className="shrink-0"
                  >
                    {locType} {loc}
                  </Button>
                ))}
              </div>
              <ScrollArea className="flex-1 p-6">
                <div className="space-y-8">
                  {locChunks[currentLoc].map((chunk, idx) => (
                    <div key={chunk._id} className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-primary/80">Chunk {idx + 1}</span>
                        {chunk.sectionTitle && <span>• {chunk.sectionTitle}</span>}
                        <span>• ~{chunk.tokenEstimate} tokens</span>
                      </div>
                      <div className="bg-card p-4 rounded-lg border border-white/5 text-sm whitespace-pre-wrap leading-relaxed font-mono">
                        {chunk.text}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {isReady && activeTab === "content" && isVideo && (
            <div className="border border-white/10 rounded-xl overflow-hidden flex flex-col h-[calc(100vh-14rem)] min-h-[500px] bg-card/30">
              <div className="p-4 bg-black flex justify-center border-b border-white/10 shrink-0">
                <video 
                  ref={videoRef}
                  src={source.fileUrl} 
                  controls 
                  onTimeUpdate={handleTimeUpdate}
                  className="max-h-[300px] w-full rounded"
                />
              </div>
              <div className="p-4 border-b border-white/10 bg-card/50 flex items-center justify-between shrink-0">
                <h3 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4"/> Transcript Viewer</h3>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    <input 
                      type="checkbox" 
                      checked={autoScroll} 
                      onChange={(e) => setAutoScroll(e.target.checked)}
                      className="rounded border-white/10 bg-black/20"
                    />
                    Auto-scroll
                  </label>
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input 
                      placeholder="Search transcript..." 
                      className="pl-9 h-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div 
                className="flex-1 min-h-0 overflow-y-auto"
                onWheel={() => setAutoScroll(false)}
                onTouchMove={() => setAutoScroll(false)}
              >
                <div className="p-4">
                  {segments === undefined ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                  ) : filteredSegments.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">No transcript found.</div>
                  ) : (
                    <div className="space-y-4">
                      {filteredSegments.map(seg => (
                        <div 
                          key={seg._id} 
                          ref={(el) => (segmentRefs.current[seg._id] = el)}
                          className={`group flex gap-4 p-3 rounded-lg transition-colors cursor-pointer ${
                            activeSegmentId === seg._id 
                              ? "bg-primary/20 border-l-2 border-primary" 
                              : "hover:bg-white/5"
                          }`}
                          onClick={() => {
                            setAutoScroll(true);
                            handleSeek(seg.startTime);
                          }}
                        >
                          <div className={`text-xs font-mono pt-1 shrink-0 flex items-center gap-1 transition-colors ${
                            activeSegmentId === seg._id ? "text-primary" : "text-primary/70 group-hover:text-primary"
                          }`}>
                            <Play className={`w-3 h-3 transition-opacity ${activeSegmentId === seg._id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
                            {formatTimestamp(seg.startTime)}
                          </div>
                          <div className={`text-sm leading-relaxed ${
                            activeSegmentId === seg._id ? "text-foreground font-medium" : "text-foreground/90"
                          }`}>
                            {seg.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Visuals Gallery */}
          {isReady && activeTab === "visuals" && (
            <div className="space-y-4">
              {/* Category Filter Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {[
                  { id: "all", label: "All Visuals" },
                  { id: "diagram", label: "Diagrams" },
                  { id: "chart", label: "Charts & Graphs" },
                  { id: "table", label: "Tables" },
                  { id: "screenshot", label: "Screenshots" },
                  { id: "video", label: "Keyframes" },
                ].map(cat => {
                  const count = visuals?.filter(v => {
                    if (cat.id === "all") return true;
                    if (cat.id === "video") return v.locationType === "video";
                    if (cat.id === "diagram") return ["diagram", "er_diagram", "architecture", "flowchart", "state_diagram"].includes(v.visualType);
                    if (cat.id === "chart") return ["chart", "graph"].includes(v.visualType);
                    return v.visualType === cat.id;
                  }).length || 0;

                  return (
                    <Button
                      key={cat.id}
                      variant={visualTypeFilter === cat.id ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setVisualTypeFilter(cat.id)}
                      className="text-xs h-8 shrink-0"
                    >
                      {cat.label}
                      <span className="ml-1.5 opacity-60 text-[10px]">({count})</span>
                    </Button>
                  );
                })}
              </div>

              {/* Gallery Cards Grid */}
              {visuals === undefined ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : visuals.length === 0 ? (
                <div className="border border-white/5 rounded-xl p-12 text-center text-muted-foreground space-y-3">
                  <ImageIcon className="w-10 h-10 mx-auto opacity-40" />
                  <p className="font-medium">No visuals detected in this source.</p>
                  <p className="text-xs max-w-md mx-auto text-muted-foreground">
                    Educational visuals such as diagrams, charts, tables, equations, and slide graphics are automatically analyzed during ingestion.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visuals
                    .filter(v => {
                      if (visualTypeFilter === "all") return true;
                      if (visualTypeFilter === "video") return v.locationType === "video";
                      if (visualTypeFilter === "diagram") return ["diagram", "er_diagram", "architecture", "flowchart", "state_diagram"].includes(v.visualType);
                      if (visualTypeFilter === "chart") return ["chart", "graph"].includes(v.visualType);
                      return v.visualType === visualTypeFilter;
                    })
                    .map(vis => (
                      <Card
                        key={vis._id}
                        className="group border border-white/10 bg-card/60 hover:border-primary/40 transition-all overflow-hidden flex flex-col cursor-pointer"
                        onClick={() => setSelectedVisual(vis)}
                      >
                        {/* Thumbnail Container */}
                        <div className="relative aspect-video bg-black/60 overflow-hidden flex items-center justify-center border-b border-white/5">
                          {vis.imageUrl ? (
                            <img
                              src={vis.imageUrl}
                              alt={vis.title || "Visual preview"}
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                              <ImageIcon className="w-6 h-6 opacity-40" />
                              <span>No preview image</span>
                            </div>
                          )}
                          <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
                            <Badge variant="secondary" className="text-[10px] bg-black/70 backdrop-blur border-white/10">
                              {vis.locationType === "page" && `Page ${vis.pageNumber}`}
                              {vis.locationType === "slide" && `Slide ${formatSlideNumber(vis.slideNumber)}`}
                              {vis.locationType === "video" && `▶ ${formatTimestamp(vis.startTime)}`}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] bg-primary/20 text-primary border-primary/30">
                              {vis.visualType}
                            </Badge>
                          </div>
                        </div>

                        {/* Content */}
                        <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-2">
                          <div>
                            <h4 className="font-semibold text-sm line-clamp-1">{vis.title || "Educational Visual"}</h4>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                              {vis.description}
                            </p>
                          </div>

                          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-muted-foreground">
                            <span className="text-[10px] uppercase font-mono tracking-wider opacity-60">
                              {vis.width && vis.height ? `${vis.width}×${vis.height}` : 'Vector'}
                            </span>
                            <div className="flex items-center gap-2">
                              {vis.locationType === "video" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] px-2 text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTab("content");
                                    setTimeout(() => handleSeek(vis.startTime), 100);
                                  }}
                                >
                                  <Play className="w-3 h-3 mr-1" />
                                  Seek
                                </Button>
                              )}
                              {!isVideo && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] px-2 text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTab("content");
                                    const loc = vis.pageNumber || formatSlideNumber(vis.slideNumber);
                                    if (loc) setSelectedLoc(loc);
                                  }}
                                >
                                  View
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Visual Detail Inspection Modal */}
      <Dialog open={!!selectedVisual} onOpenChange={(open) => !open && setSelectedVisual(null)}>
        <DialogContent className="w-[95vw] md:w-[min(92vw,900px)] max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary shrink-0" />
              <span className="truncate">{selectedVisual?.title || "Visual Evidence"}</span>
            </DialogTitle>
          </DialogHeader>

          {selectedVisual && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground border-b pb-3">
                <Badge variant="outline" className="text-primary border-primary/30 font-medium">
                  {selectedVisual.visualType}
                </Badge>
                {selectedVisual.locationType === "page" && (
                  <span className="bg-muted px-2 py-0.5 rounded">Page {selectedVisual.pageNumber}</span>
                )}
                {selectedVisual.locationType === "slide" && (
                  <span className="bg-muted px-2 py-0.5 rounded">Slide {formatSlideNumber(selectedVisual.slideNumber)}</span>
                )}
                {selectedVisual.locationType === "video" && (
                  <span className="bg-muted px-2 py-0.5 rounded font-mono">
                    ▶ {formatTimestamp(selectedVisual.startTime)} – {formatTimestamp(selectedVisual.endTime)}
                  </span>
                )}
              </div>

              {selectedVisual.imageUrl && (
                <div className="w-full bg-black/80 rounded-xl overflow-hidden flex items-center justify-center p-2 border border-white/10 max-h-[480px]">
                  <img
                    src={selectedVisual.imageUrl}
                    alt={selectedVisual.title || "Visual"}
                    className="max-h-[460px] w-auto max-w-full object-contain rounded"
                  />
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">AI Educational Explanation</h4>
                <div className="text-sm leading-relaxed bg-muted/40 p-4 rounded-lg border border-white/5 whitespace-pre-wrap">
                  {selectedVisual.description}
                </div>
              </div>

              {selectedVisual.structuredData && selectedVisual.structuredData.headers && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <TableIcon className="w-4 h-4 text-primary" /> Structured Table Data
                  </h4>
                  <div className="overflow-x-auto border border-white/10 rounded-lg">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-muted/60 text-muted-foreground uppercase text-[10px]">
                        <tr>
                          {selectedVisual.structuredData.headers.map((h, i) => (
                            <th key={i} className="p-2 border-b border-white/10">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVisual.structuredData.rows?.map((row, rIdx) => (
                          <tr key={rIdx} className="border-b border-white/5 hover:bg-muted/30">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="p-2">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedVisual.confidenceNotes && selectedVisual.confidenceNotes.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-500 space-y-1">
                  <p className="font-semibold">Observation Notes:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {selectedVisual.confidenceNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end pt-2">
                {selectedVisual.locationType === "video" ? (
                  <Button
                    onClick={() => {
                      setSelectedVisual(null);
                      setActiveTab("content");
                      setTimeout(() => handleSeek(selectedVisual.startTime), 100);
                    }}
                    className="gap-2"
                  >
                    <Play className="w-4 h-4" /> Seek to Frame
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setSelectedVisual(null);
                      setActiveTab("content");
                      const loc = selectedVisual.pageNumber || formatSlideNumber(selectedVisual.slideNumber);
                      if (loc) setSelectedLoc(loc);
                    }}
                    className="gap-2"
                  >
                    <FileText className="w-4 h-4" /> View in Source
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
