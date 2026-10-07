"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatDistanceToNow } from "date-fns";
import { FileType2, MoreVertical, Trash2, Edit2, Loader2, Play, FileText, Image as ImageIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EditSourceDialog } from "@/components/sources/edit-source-dialog";
import Link from "next/link";

export function SourceList({ courseId }) {
  const [editingSource, setEditingSource] = useState(null);
  const sources = useQuery(api.sources.getCourseSources, { courseId });
  const deleteSource = useMutation(api.sources.deleteSource);

  if (sources === undefined) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sources.length === 0) {
    return null; // Don't show the table if no sources, the page handles empty state
  }

  const handleDelete = async (sourceId, sourceName) => {
    if (confirm(`Are you sure you want to delete "${sourceName}"? This action cannot be undone.`)) {
      try {
        await deleteSource({ sourceId });
        toast.success(`Deleted ${sourceName}`);
      } catch (e) {
        toast.error(`Failed to delete ${sourceName}`);
      }
    }
  };

  const getSourceIcon = (type) => {
    switch (type) {
      case "pdf": return <FileText className="w-5 h-5 text-red-500" />;
      case "video": return <Play className="w-5 h-5 text-blue-500" />;
      case "pptx": return <ImageIcon className="w-5 h-5 text-orange-500" />;
      case "audio": return <Play className="w-5 h-5 text-purple-500" />;
      default: return <FileType2 className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((source) => (
            <TableRow key={source._id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-3">
                  {getSourceIcon(source.type)}
                  <span className="truncate max-w-[200px] md:max-w-xs" title={source.name}>
                    {source.name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="uppercase text-xs">{source.type}</TableCell>
              <TableCell className="text-muted-foreground">{formatSize(source.size)}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant="outline" className={
                    source.status === 'ready' ? 'border-green-500 text-green-600' :
                    ['queued', 'extracting', 'normalizing', 'chunking'].includes(source.status) ? 'border-blue-500 text-blue-600' :
                    source.status === 'failed' ? 'border-red-500 text-red-600' :
                    'border-muted-foreground/30 text-muted-foreground'
                  }>
                    {source.status === 'failed' && source.processingError === 'Needs OCR' ? 'Needs OCR' : source.status}
                  </Badge>
                  {['queued', 'extracting', 'normalizing', 'chunking'].includes(source.status) && (
                    <div className="text-[10px] text-muted-foreground flex items-center justify-between mt-1">
                      <span className="truncate max-w-[80px]">{source.processingStage || source.status}</span>
                      <span>{source.processingProgress || 0}%</span>
                    </div>
                  )}
                  {source.status === 'ready' && source.chunkCount > 0 && (
                     <div className="text-[10px] text-muted-foreground mt-1">
                       {source.pageCount || source.slideCount || 0} {source.type === 'pdf' ? 'pages' : 'slides'} • {source.chunkCount} chunks
                     </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(source.createdAt, { addSuffix: true })}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", className: "h-8 w-8 p-0" })}>
                    <span className="sr-only">Open menu</span>
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/courses/${courseId}/sources/${source._id}`}>
                          View details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditingSource(source)}>
                        <Edit2 className="mr-2 h-4 w-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleDelete(source._id, source.name)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      
      <EditSourceDialog 
        source={editingSource} 
        open={!!editingSource} 
        onOpenChange={(open) => !open && setEditingSource(null)} 
      />
    </div>
  );
}
