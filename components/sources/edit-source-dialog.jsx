"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Display name cannot be empty").max(100),
});

export function EditSourceDialog({ source, open, onOpenChange }) {
  const [isLoading, setIsLoading] = useState(false);
  const updateSource = useMutation(api.sources.updateSource);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: source?.name || "",
    },
  });

  async function onSubmit(values) {
    if (!source) return;
    setIsLoading(true);
    try {
      await updateSource({
        sourceId: source._id,
        name: values.name,
      });
      toast.success("Source renamed successfully!");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to rename source.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (val && source) {
        form.reset({ name: source.name });
      }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rename Source</DialogTitle>
          <DialogDescription>
            Change the display name of this source without affecting the original file.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Chapter 1 Notes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
