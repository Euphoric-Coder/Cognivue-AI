"use client";

import { useUser } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Moon, Sun, Laptop } from "lucide-react";

export default function SettingsPage() {
  const { user } = useUser();
  const { theme, setTheme } = useTheme();

  const handleSavePreferences = () => {
    toast.success("Preferences saved successfully.");
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-1">
          Manage your account and learning preferences.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Manage your public profile details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-16 w-16 rounded-full bg-muted overflow-hidden">
                {user?.imageUrl && (
                  <img src={user.imageUrl} alt="Profile" className="h-full w-full object-cover" />
                )}
              </div>
              <Button variant="outline" size="sm">Change Avatar</Button>
            </div>
            
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input defaultValue={user?.fullName || ""} disabled />
              <p className="text-xs text-muted-foreground">Manage your name in Clerk account settings.</p>
            </div>
            
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input defaultValue={user?.primaryEmailAddress?.emailAddress || ""} disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Customize the interface theme.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup 
              defaultValue={theme} 
              onValueChange={setTheme}
              className="grid grid-cols-3 gap-4"
            >
              <div>
                <RadioGroupItem value="light" id="light" className="peer sr-only" />
                <Label
                  htmlFor="light"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <Sun className="mb-3 h-6 w-6" />
                  Light
                </Label>
              </div>
              <div>
                <RadioGroupItem value="dark" id="dark" className="peer sr-only" />
                <Label
                  htmlFor="dark"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <Moon className="mb-3 h-6 w-6" />
                  Dark
                </Label>
              </div>
              <div>
                <RadioGroupItem value="system" id="system" className="peer sr-only" />
                <Label
                  htmlFor="system"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <Laptop className="mb-3 h-6 w-6" />
                  System
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Learning Preferences</CardTitle>
            <CardDescription>Configure how your AI tutor responds (Coming in V0.9).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-2">
              <Label>Preferred Tutor Style</Label>
              <Select defaultValue="standard">
                <SelectTrigger>
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard - Balanced explanations</SelectItem>
                  <SelectItem value="socratic">Socratic - Guides you to the answer</SelectItem>
                  <SelectItem value="concise">Concise - To the point, bulleted</SelectItem>
                  <SelectItem value="detailed">Detailed - Comprehensive with analogies</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Explanation Depth</Label>
              <Select defaultValue="undergrad">
                <SelectTrigger>
                  <SelectValue placeholder="Select depth" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner / High School</SelectItem>
                  <SelectItem value="undergrad">Undergraduate (Default)</SelectItem>
                  <SelectItem value="graduate">Graduate / Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label>Assessment Difficulty Target</Label>
              <Select defaultValue="adaptive">
                <SelectTrigger>
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adaptive">Adaptive (Auto-adjusts)</SelectItem>
                  <SelectItem value="easy">Review (Easier)</SelectItem>
                  <SelectItem value="hard">Challenge (Harder)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSavePreferences}>Save Preferences</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
