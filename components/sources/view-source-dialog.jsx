"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileType2, FileText, Play, Image as ImageIcon, HardDrive } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ViewSourceDialog({ source, open, onOpenChange }) {
  if (!source) return null;

  const getIcon = (type) => {
    switch (type) {
      case 'pdf': return <FileText className="w-8 h-8 text-red-500" />;
      case 'video': return <Play className="w-8 h-8 text-blue-500" />;
      case 'image': return <ImageIcon className="w-8 h-8 text-green-500" />;
      default: return <FileType2 className="w-8 h-8 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Source Details</DialogTitle>
          <DialogDescription>
            Information about the uploaded file.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 py-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-muted rounded-xl">
              {getIcon(source.type)}
            </div>
            <div>
              <h3 className="text-lg font-semibold leading-none">{source.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{source.originalFileName}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium text-xs uppercase tracking-wider">Status</span>
              <div className="font-medium">
                <Badge variant="outline" className={
                  source.status === 'ready' ? 'border-green-500 text-green-600' :
                  source.status === 'processing' ? 'border-blue-500 text-blue-600' :
                  source.status === 'failed' ? 'border-red-500 text-red-600' :
                  'border-muted-foreground/30 text-muted-foreground'
                }>
                  {source.status}
                </Badge>
              </div>
            </div>
            
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium text-xs uppercase tracking-wider">File Size</span>
              <div className="font-medium flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                {(source.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
            
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium text-xs uppercase tracking-wider">Type</span>
              <div className="font-medium uppercase">{source.type}</div>
            </div>
            
            <div className="space-y-1">
              <span className="text-muted-foreground font-medium text-xs uppercase tracking-wider">MIME Type</span>
              <div className="font-medium truncate" title={source.mimeType}>{source.mimeType}</div>
            </div>
            
            <div className="space-y-1 col-span-2">
              <span className="text-muted-foreground font-medium text-xs uppercase tracking-wider">Uploaded</span>
              <div className="font-medium">
                {new Date(source.createdAt).toLocaleString()} ({formatDistanceToNow(source.createdAt, { addSuffix: true })})
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
