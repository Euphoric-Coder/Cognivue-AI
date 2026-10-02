import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Target, Activity, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ProgressPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Learning Progress</h2>
          <p className="text-muted-foreground mt-1">Track your topic mastery and assessment performance.</p>
        </div>
        <Badge variant="outline" className="text-primary border-primary/30">Coming in V0.8</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Overall Mastery", icon: Target, desc: "0% complete" },
          { title: "Topics Mastered", icon: Activity, desc: "0 topics" },
          { title: "Assessment Score", icon: TrendingUp, desc: "No data" },
          { title: "Study Streak", icon: Flame, desc: "0 days" },
        ].map((stat, i) => (
          <Card key={i} className="opacity-70">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">{stat.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 mt-6">
        <Card className="h-64 flex flex-col items-center justify-center text-center opacity-70 border-dashed">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
            <Target className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-medium mb-1">Topic Mastery</h3>
          <p className="text-sm text-muted-foreground max-w-[250px]">
            No mastery data yet. Complete assessments to begin building your personal learner model.
          </p>
        </Card>
        
        <Card className="h-64 flex flex-col items-center justify-center text-center opacity-70 border-dashed">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
            <Activity className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-medium mb-1">Recommended Focus</h3>
          <p className="text-sm text-muted-foreground max-w-[250px]">
            Recommendations will appear here based on your assessment performance.
          </p>
        </Card>
      </div>
    </div>
  );
}
