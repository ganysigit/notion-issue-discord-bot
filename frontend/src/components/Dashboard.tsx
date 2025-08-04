import React, { useState, useEffect } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Activity, Database, Clock, MemoryStick, Plus, Trash2, RefreshCw } from 'lucide-react';

interface Connection {
  id: string;
  connection_name: string;
  notion_database_id: string;
  discord_channel_id: string;
  created_at: string;
}

interface TrackedIssue {
  id: string;
  issue_id: string;
  title: string;
  status: string;
  created_at: string;
}

interface StatusData {
  activeConnections: number;
  trackedIssues: number;
  botUptime: string;
  memoryUsage: string;
}

const Dashboard: React.FC = () => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [trackedIssues, setTrackedIssues] = useState<TrackedIssue[]>([]);
  const [status, setStatus] = useState<StatusData>({
    activeConnections: 0,
    trackedIssues: 0,
    botUptime: '0s',
    memoryUsage: '0 MB'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newConnection, setNewConnection] = useState({
    connection_name: '',
    notion_database_id: '',
    discord_channel_id: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [connectionsRes, issuesRes, statusRes] = await Promise.all([
        fetch('/api/connections'),
        fetch('/api/tracked-issues'),
        fetch('/api/status')
      ]);

      if (connectionsRes.ok) {
        const connectionsResponse = await connectionsRes.json();
        const connectionsData = connectionsResponse.success ? connectionsResponse.data : connectionsResponse;
        setConnections(Array.isArray(connectionsData) ? connectionsData : []);
      }

      if (issuesRes.ok) {
        const issuesResponse = await issuesRes.json();
        const issuesData = issuesResponse.success ? issuesResponse.data : issuesResponse;
        setTrackedIssues(Array.isArray(issuesData) ? issuesData : []);
      }

      if (statusRes.ok) {
        const statusResponse = await statusRes.json();
        const statusData = statusResponse.success ? statusResponse.data : statusResponse;
        setStatus({
          activeConnections: statusData.connectionsCount || 0,
          trackedIssues: statusData.trackedIssuesCount || 0,
          botUptime: statusData.uptime ? `${Math.floor(statusData.uptime / 60)}m ${Math.floor(statusData.uptime % 60)}s` : '0s',
          memoryUsage: statusData.memoryUsage ? `${Math.round(statusData.memoryUsage.heapUsed / 1024 / 1024)}MB` : '0MB'
        });
      }

      setError(null);
    } catch (err) {
      setError('Failed to load data');
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const addConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notionDatabaseId: newConnection.notion_database_id,
          discordChannelId: newConnection.discord_channel_id,
          connectionName: newConnection.connection_name
        }),
      });

      if (response.ok) {
        setNewConnection({ connection_name: '', notion_database_id: '', discord_channel_id: '' });
        loadData();
      } else {
        setError('Failed to add connection');
      }
    } catch (err) {
      setError('Failed to add connection');
      console.error('Error adding connection:', err);
    }
  };

  const deleteConnection = async (id: string) => {
    try {
      const response = await fetch(`/api/connections/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadData();
      } else {
        setError('Failed to delete connection');
      }
    } catch (err) {
      setError('Failed to delete connection');
      console.error('Error deleting connection:', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        {/* Breadcrumb Navigation */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Discord-Notion Bot Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Manage your Discord to Notion integrations and monitor bot activity
            </p>
          </div>
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status.activeConnections}</div>
              <p className="text-xs text-muted-foreground">Discord-Notion links</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tracked Issues</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status.trackedIssues}</div>
              <p className="text-xs text-muted-foreground">GitHub issues monitored</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bot Uptime</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status.botUptime}</div>
              <p className="text-xs text-muted-foreground">Time since last restart</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
              <MemoryStick className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status.memoryUsage}</div>
              <p className="text-xs text-muted-foreground">Current memory consumption</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Add New Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add New Connection
              </CardTitle>
              <CardDescription>
                Create a new Discord to Notion database connection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={addConnection} className="space-y-4 max-w-full">
                <div className="space-y-2">
                  <Label htmlFor="name">Connection Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="e.g., Bug Reports"
                    value={newConnection.connection_name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewConnection({ ...newConnection, connection_name: e.target.value })}
                    className="w-full min-w-0"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notion_db">Notion Database ID</Label>
                  <Input
                    id="notion_db"
                    type="text"
                    placeholder="e.g., 12345678-1234-1234-1234-123456789abc"
                    value={newConnection.notion_database_id}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewConnection({ ...newConnection, notion_database_id: e.target.value })}
                    className="w-full min-w-0"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discord_channel">Discord Channel ID</Label>
                  <Input
                    id="discord_channel"
                    type="text"
                    placeholder="e.g., 123456789012345678"
                    value={newConnection.discord_channel_id}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewConnection({ ...newConnection, discord_channel_id: e.target.value })}
                    className="w-full min-w-0"
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  Add Connection
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Current Connections */}
          <Card>
            <CardHeader>
              <CardTitle>Current Connections</CardTitle>
              <CardDescription>
                Manage your active Discord to Notion integrations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-4">Loading connections...</div>
              ) : connections.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  No connections configured yet
                </div>
              ) : (
                <div className="space-y-4">
                  {connections.map((connection) => (
                    <div key={connection.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{connection.connection_name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Channel: {connection.discord_channel_id}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Database: {connection.notion_database_id.substring(0, 8)}...
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteConnection(connection.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tracked Issues */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Tracked Issues</CardTitle>
            <CardDescription>
              GitHub issues currently being monitored
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-4">Loading tracked issues...</div>
            ) : trackedIssues.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                No issues being tracked
              </div>
            ) : (
              <div className="space-y-4">
                {trackedIssues.map((issue) => (
                  <div key={issue.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">{issue.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        Issue #{issue.issue_id} • Status: {issue.status}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Tracked since: {new Date(issue.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;