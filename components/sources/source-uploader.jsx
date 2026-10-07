"use client";

import { useState, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@clerk/nextjs";
import { UploadCloud, FileType2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

export function SourceUploader({ courseId }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { getToken, userId } = useAuth();
  
  const generateUploadUrl = useMutation(api.sources.generateUploadUrl);
  const createSource = useMutation(api.sources.createSource);
  const fileInputRef = useRef(null);

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files) => {
    setUploading(true);
    setProgress(10);
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Simple client-side validation
        if (file.size > 50 * 1024 * 1024) { // 50MB limit
          toast.error(`File ${file.name} is too large (max 50MB)`);
          continue;
        }

        // Get upload URL from Convex
        const postUrl = await generateUploadUrl();
        setProgress(30);

        // Upload to Convex storage
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        
        if (!result.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }
        
        setProgress(70);
        
        const { storageId } = await result.json();

        // Determine type based on mime type or extension
        let type = "other";
        if (file.type.includes("pdf")) type = "pdf";
        else if (file.type.includes("presentation") || file.name.endsWith(".pptx")) type = "pptx";
        else if (file.type.includes("video")) type = "video";
        else if (file.type.includes("audio")) type = "audio";
        else if (file.type.includes("document") || file.type.includes("text")) type = "document";

        // Save metadata to Convex DB
        const { sourceId, fileUrl } = await createSource({
          courseId,
          name: file.name,
          originalFileName: file.name,
          type,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          storageId,
        });
        
        setProgress(100);
        toast.success(`${file.name} uploaded successfully`);

        // Trigger backend processing if supported
        if (type === "pdf" || type === "pptx") {
          toast("Starting processing pipeline...", {
            description: `${file.name} has been queued for ingestion.`
          });
          
          const token = await getToken();
          
          fetch("/api/ingestion/trigger", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              sourceId,
              courseId,
              userId,
              fileUrl,
              mimeType: file.type || "application/octet-stream",
              originalFileName: file.name
            })
          }).catch(err => console.error("Failed to trigger ingestion:", err));
        } else {
          toast.info(`${file.name} cannot be processed yet. Processing support coming in a later version.`);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("An error occurred during upload.");
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="w-full mb-8">
      <div 
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
        } ${uploading ? "opacity-70 pointer-events-none" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <UploadCloud className={`w-12 h-12 mb-4 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
        
        {uploading ? (
          <div className="w-full max-w-md text-center space-y-4">
            <h3 className="text-lg font-semibold">Uploading...</h3>
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground">Please wait while your files are securely uploaded.</p>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold mb-2 text-center">Add learning material</h3>
            <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
              Drag and drop files here to build your course knowledge base.
            </p>
            
            <div className="flex flex-col items-center gap-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">or</span>
              
              <Button onClick={() => fileInputRef.current?.click()} type="button">
                Browse Files
              </Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={onFileSelect} 
                multiple
                accept=".pdf,.pptx,.ppt,.doc,.docx,.txt,video/*,audio/*"
              />
            </div>
            
            <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><FileType2 className="w-3 h-3" /> PDF</span>
              <span className="flex items-center gap-1"><FileType2 className="w-3 h-3" /> PPTX</span>
              <span className="flex items-center gap-1"><FileType2 className="w-3 h-3" /> Video</span>
              <span className="flex items-center gap-1"><FileType2 className="w-3 h-3" /> Audio</span>
              <span className="flex items-center gap-1"><FileType2 className="w-3 h-3" /> Documents</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
