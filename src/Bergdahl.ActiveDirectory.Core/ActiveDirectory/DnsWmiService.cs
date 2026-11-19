namespace Bergdahl.ActiveDirectory.Core.ActiveDirectory;

using System.Management;
using Bergdahl.ActiveDirectory.Core.Models;

public interface IDnsWmiService
{
    List<DnsRecord> GetRecords(string zone, string username, string password, string domain);
    /// <summary>
    /// Adds an A record and its associated PTR record in the matching reverse lookup zone.
    /// The A record is kept even if the PTR record can't be created; the result says why.
    /// </summary>
    DnsAddResult AddRecord(string zone, string hostname, string ip, string username, string password, string domain);
    void AddCnameRecord(string zone, string aliasName, string targetHost, string username, string password, string domain);
    /// <summary>
    /// Removes the A and CNAME records for a host, plus the PTR records that point at it.
    /// </summary>
    DnsRemoveResult RemoveRecord(string zone, string hostname, string username, string password, string domain);
}

public class DnsWmiService : IDnsWmiService
{
    private readonly string _dnsServer;

    public DnsWmiService(string dnsServer)
    {
        _dnsServer = dnsServer;
    }
    private ManagementScope Connect(string username, string password, string domain)
    {
        var scope = new ManagementScope($@"\\{_dnsServer}\root\MicrosoftDNS");

        scope.Options = new ConnectionOptions
        {
            Username = $"{domain}\\{username}",
            Password = password,
            Impersonation = ImpersonationLevel.Impersonate,
            Authentication = AuthenticationLevel.PacketPrivacy
        };

        scope.Connect();
        return scope;
    }

    public List<DnsRecord> GetRecords(string zone, string username, string password, string domain)
    {
        var scope = Connect(username, password, domain);
        var records = new List<DnsRecord>();

        // Fetch A records
        var aQuery = new ObjectQuery($"SELECT * FROM MicrosoftDNS_AType WHERE ContainerName='{zone}'");
        using var aSearcher = new ManagementObjectSearcher(scope, aQuery);
        foreach (ManagementObject obj in aSearcher.Get())
        {
            records.Add(new DnsRecord
            {
                HostName = obj["OwnerName"]?.ToString() ?? string.Empty,
                IpAddress = obj["IPAddress"]?.ToString() ?? string.Empty,
                RecordType = "A",
                TTL = Convert.ToInt32(obj["TTL"])
            });
        }

        // Fetch CNAME records
        var cnameQuery = new ObjectQuery($"SELECT * FROM MicrosoftDNS_CNAMEType WHERE ContainerName='{zone}'");
        using var cnameSearcher = new ManagementObjectSearcher(scope, cnameQuery);
        foreach (ManagementObject obj in cnameSearcher.Get())
        {
            records.Add(new DnsRecord
            {
                HostName = obj["OwnerName"]?.ToString() ?? string.Empty,
                IpAddress = obj["PrimaryName"]?.ToString() ?? string.Empty, // Use target host in place of IP address for UI
                RecordType = "CNAME",
                TTL = Convert.ToInt32(obj["TTL"])
            });
        }

        return records;
    }

    public DnsAddResult AddRecord(string zone, string hostname, string ip,
                                  string username, string password, string domain)
    {
        var scope = Connect(username, password, domain);
        var dnsClass = new ManagementClass(scope,
            new ManagementPath("MicrosoftDNS_AType"), null);

        var inParams = dnsClass.GetMethodParameters("CreateInstanceFromPropertyData");
        inParams["DnsServerName"] = _dnsServer;
        inParams["ContainerName"] = zone;
        var fqdn = hostname.EndsWith($".{zone}", StringComparison.OrdinalIgnoreCase)
            ? hostname
            : $"{hostname}.{zone}";
        inParams["OwnerName"] = fqdn;
        inParams["IPAddress"] = ip;

        dnsClass.InvokeMethod("CreateInstanceFromPropertyData", inParams, null);

        // Same as ticking "Create associated pointer (PTR) record" in DNS Manager:
        // the A record stays even if the PTR record can't be made.
        try
        {
            return AddPtrRecord(scope, fqdn, ip);
        }
        catch (Exception ex)
        {
            return new DnsAddResult { PtrWarning = $"The associated PTR record could not be created: {ex.Message}" };
        }
    }

    private DnsAddResult AddPtrRecord(ManagementScope scope, string fqdn, string ip)
    {
        var ptrOwner = ReverseDns.GetPtrOwnerName(ip);
        var reverseZone = ReverseDns.FindReverseZone(ptrOwner, GetReverseZones(scope));
        if (reverseZone == null)
        {
            return new DnsAddResult
            {
                PtrWarning = $"The associated PTR record was not created because no reverse lookup zone exists for {ip}."
            };
        }

        // Skip if this exact PTR record is already there
        var ptrQuery = new ObjectQuery($"SELECT * FROM MicrosoftDNS_PTRType WHERE ContainerName='{reverseZone}' AND OwnerName='{ptrOwner}'");
        using (var ptrSearcher = new ManagementObjectSearcher(scope, ptrQuery))
        {
            foreach (ManagementObject obj in ptrSearcher.Get())
            {
                if (ReverseDns.SameHost(obj["PTRDomainName"]?.ToString(), fqdn))
                    return new DnsAddResult { PtrCreated = true, ReverseZone = reverseZone };
            }
        }

        var ptrClass = new ManagementClass(scope, new ManagementPath("MicrosoftDNS_PTRType"), null);
        var ptrParams = ptrClass.GetMethodParameters("CreateInstanceFromPropertyData");
        ptrParams["DnsServerName"] = _dnsServer;
        ptrParams["ContainerName"] = reverseZone;
        ptrParams["OwnerName"] = ptrOwner;
        ptrParams["PTRDomainName"] = fqdn.TrimEnd('.') + ".";

        ptrClass.InvokeMethod("CreateInstanceFromPropertyData", ptrParams, null);
        return new DnsAddResult { PtrCreated = true, ReverseZone = reverseZone };
    }

    public void AddCnameRecord(string zone, string aliasName, string targetHost,
                               string username, string password, string domain)
    {
        var scope = Connect(username, password, domain);
        var dnsClass = new ManagementClass(scope, 
            new ManagementPath("MicrosoftDNS_CNAMEType"), null);

        var inParams = dnsClass.GetMethodParameters("CreateInstanceFromPropertyData");
        inParams["DnsServerName"] = _dnsServer;
        inParams["ContainerName"] = zone;
        var fqdn = aliasName.EndsWith($".{zone}", StringComparison.OrdinalIgnoreCase) 
            ? aliasName 
            : $"{aliasName}.{zone}";
        inParams["OwnerName"] = fqdn;
        inParams["PrimaryName"] = targetHost;

        dnsClass.InvokeMethod("CreateInstanceFromPropertyData", inParams, null);
    }

    private static List<string> GetReverseZones(ManagementScope scope)
    {
        var reverseZones = new List<string>();
        var zoneQuery = new ObjectQuery("SELECT Name FROM MicrosoftDNS_Zone WHERE Reverse = TRUE");
        using var zoneSearcher = new ManagementObjectSearcher(scope, zoneQuery);
        foreach (ManagementObject obj in zoneSearcher.Get())
        {
            var name = obj["Name"]?.ToString();
            if (!string.IsNullOrWhiteSpace(name)) reverseZones.Add(name);
        }
        return reverseZones;
    }

    /// <summary>
    /// Deletes the PTR records for <paramref name="ip"/> that point at <paramref name="fqdn"/>.
    /// PTR records for the same IP that point at other hosts are left alone.
    /// </summary>
    private static int RemovePtrRecords(ManagementScope scope, string fqdn, string ip)
    {
        var ptrOwner = ReverseDns.GetPtrOwnerName(ip);
        var reverseZone = ReverseDns.FindReverseZone(ptrOwner, GetReverseZones(scope));
        if (reverseZone == null) return 0;

        var removed = 0;
        var ptrQuery = new ObjectQuery($"SELECT * FROM MicrosoftDNS_PTRType WHERE ContainerName='{reverseZone}' AND OwnerName='{ptrOwner}'");
        using var ptrSearcher = new ManagementObjectSearcher(scope, ptrQuery);
        foreach (ManagementObject obj in ptrSearcher.Get())
        {
            if (ReverseDns.SameHost(obj["PTRDomainName"]?.ToString(), fqdn))
            {
                obj.Delete();
                removed++;
            }
        }
        return removed;
    }

    public DnsRemoveResult RemoveRecord(string zone, string hostname,
                                        string username, string password, string domain)
    {
        var scope = Connect(username, password, domain);
        var fqdn = hostname.EndsWith($".{zone}", StringComparison.OrdinalIgnoreCase)
            ? hostname
            : $"{hostname}.{zone}";

        var deleted = false;
        var removedIps = new List<string>();

        // Try deleting from A records
        var aQuery = new ObjectQuery($"SELECT * FROM MicrosoftDNS_AType WHERE ContainerName='{zone}' AND OwnerName='{fqdn}'");
        using (var aSearcher = new ManagementObjectSearcher(scope, aQuery))
        {
            foreach (ManagementObject obj in aSearcher.Get())
            {
                var ip = obj["IPAddress"]?.ToString();
                obj.Delete();
                deleted = true;
                if (!string.IsNullOrWhiteSpace(ip)) removedIps.Add(ip);
            }
        }
        
        // Try deleting from CNAME records
        var cnameQuery = new ObjectQuery($"SELECT * FROM MicrosoftDNS_CNAMEType WHERE ContainerName='{zone}' AND OwnerName='{fqdn}'");
        using (var cnameSearcher = new ManagementObjectSearcher(scope, cnameQuery))
        {
            foreach (ManagementObject obj in cnameSearcher.Get())
            {
                obj.Delete();
                deleted = true;
            }
        }

        // Remove the associated PTR records, like DNS Manager does when deleting a host.
        // The A record is already gone, so a PTR failure only produces a warning.
        var result = new DnsRemoveResult { Deleted = deleted };
        foreach (var ip in removedIps)
        {
            try
            {
                result.PtrDeleted += RemovePtrRecords(scope, fqdn, ip);
            }
            catch (Exception ex)
            {
                result.PtrWarning = $"The associated PTR record for {ip} could not be deleted: {ex.Message}";
            }
        }
        return result;
    }

}