using System.Reflection;
var a = Assembly.LoadFile("/home/guilherme/.nuget/packages/jellyfin.controller/10.9.11/lib/net8.0/MediaBrowser.Controller.dll");
foreach (var t in a.GetTypes()) {
    if (t.Name.Contains("Plugin")) 
        Console.WriteLine(t.FullName);
}
