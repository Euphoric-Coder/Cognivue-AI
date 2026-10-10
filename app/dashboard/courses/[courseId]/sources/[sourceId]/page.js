"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, RefreshCw, FileText, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatSlideNumber } from "@/lib/utils";

export default function SourceDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const sourceId = params.sourceId;
  const courseId = params.courseId;

  const source = useQuery(api.sources.getSource, { sourceId });
  const chunks = useQuery(api.sources.getSourceChunks, { sourceId });
  
  const [selectedLoc, setSelectedLoc] = useState(null);

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

  const isFailed = source.status === 'failed';
  const isReady = source.status === 'ready';
  const isProcessing = ['queued', 'extracting', 'normalizing', 'chunking'].includes(source.status);
  
  // Group chunks by location (page or slide)
  const locChunks = {};
  chunks.forEach(chunk => {
    const loc = chunk.pageNumber || formatSlideNumber(chunk.slideNumber) || "Unknown";
    if (!locChunks[loc]) locChunks[loc] = [];
    locChunks[loc].push(chunk);
  });
  
  const locs = Object.keys(locChunks).map(Number).sort((a,b)=>a-b);
  const currentLoc = selectedLoc || (locs.length > 0 ? locs[0] : null);

  const locType = source.type === 'pdf' ? 'Page' : 'Slide';

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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="col-span-1 border-white/10 bg-card/50">
          <CardContent className="p-6 space-y-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Status</p>
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
              <p className="text-xs text-muted-foreground uppercase mb-1">Type</p>
              <p className="text-sm font-medium uppercase">{source.type}</p>
            </div>

            {isReady && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">{locType}s</p>
                  <p className="text-sm font-medium">{source.pageCount || source.slideCount || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Extracted Chunks</p>
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

        <div className="col-span-1 md:col-span-3">
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

          {isReady && chunks.length > 0 && currentLoc !== null && (
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
        </div>
      </div>
    </div>
  );
}
