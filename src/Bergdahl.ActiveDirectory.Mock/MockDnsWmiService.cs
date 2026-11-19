namespace Bergdahl.ActiveDirectory.Mock;

using Bergdahl.ActiveDirectory.Core.ActiveDirectory;
using Bergdahl.ActiveDirectory.Core.Models;

public class MockDnsWmiService : IDnsWmiService
{
    private readonly object _lock = new();
    private readonly Dictionary<string, List<DnsRecord>> _zones = new(StringComparer.OrdinalIgnoreCase)
    {
        ["example.com"] = new List<DnsRecord>
        {
            new DnsRecord { HostName = "www.example.com", IpAddress = "192.168.1.10", RecordType = "A", TTL = 3600 },
            new DnsRecord { HostName = "api.example.com", IpAddress = "192.168.1.20", RecordType = "A", TTL = 3600 }
        },
        // Reverse lookup zone for 192.168.1.0/24. PTR records keep the target host in IpAddress.
        ["1.168.192.in-addr.arpa"] = new List<DnsRecord>
        {
            new DnsRecord { HostName = "10.1.168.192.in-addr.arpa", IpAddress = "www.example.com.", RecordType = "PTR", TTL = 3600 },
            new DnsRecord { HostName = "20.1.168.192.in-addr.arpa", IpAddress = "api.example.com.", RecordType = "PTR", TTL = 3600 }
        }
    };

    public List<DnsRecord> GetRecords(string zone, string username, string password, string domain)
    {
        lock (_lock)
        {
            if (_zones.TryGetValue(zone, out var list))
            {
                // Return copies to avoid external mutation
                return list.Select(r => new DnsRecord
                {
                    HostName = r.HostName,
                    IpAddress = r.IpAddress,
                    RecordType = r.RecordType,
                    TTL = r.TTL
                }).ToList();
            }
            return new List<DnsRecord>();
        }
    }

    public DnsAddResult AddRecord(string zone, string hostname, string ip, string username, string password, string domain)
    {
        string fqdn;
        lock (_lock)
        {
            if (!_zones.TryGetValue(zone, out var list))
            {
                list = new List<DnsRecord>();
                _zones[zone] = list;
            }

            fqdn = hostname.EndsWith($".{zone}", StringComparison.OrdinalIgnoreCase)
                ? hostname
                : $"{hostname}.{zone}";
            // Replace if exists
            var existing = list.FirstOrDefault(r => string.Equals(r.HostName, fqdn, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                existing.IpAddress = ip;
                existing.RecordType = "A";
                existing.TTL = 3600;
            }
            else
            {
                list.Add(new DnsRecord { HostName = fqdn, IpAddress = ip, RecordType = "A", TTL = 3600 });
            }
        }

        return AddPtrRecord(fqdn, ip);
    }

    private DnsAddResult AddPtrRecord(string fqdn, string ip)
    {
        lock (_lock)
        {
            var ptrOwner = ReverseDns.GetPtrOwnerName(ip);
            var reverseZones = _zones.Keys.Where(z => z.EndsWith(".in-addr.arpa", StringComparison.OrdinalIgnoreCase));
            var reverseZone = ReverseDns.FindReverseZone(ptrOwner, reverseZones);
            if (reverseZone == null)
            {
                return new DnsAddResult
                {
                    PtrWarning = $"The associated PTR record was not created because no reverse lookup zone exists for {ip}."
                };
            }

            var list = _zones[reverseZone];
            var exists = list.Any(r => r.RecordType == "PTR" &&
                                       string.Equals(r.HostName, ptrOwner, StringComparison.OrdinalIgnoreCase) &&
                                       ReverseDns.SameHost(r.IpAddress, fqdn));
            if (!exists)
            {
                list.Add(new DnsRecord { HostName = ptrOwner, IpAddress = fqdn.TrimEnd('.') + ".", RecordType = "PTR", TTL = 3600 });
            }

            return new DnsAddResult { PtrCreated = true, ReverseZone = reverseZone };
        }
    }

    public void AddCnameRecord(string zone, string aliasName, string targetHost, string username, string password, string domain)
    {
        lock (_lock)
        {
            if (!_zones.TryGetValue(zone, out var list))
            {
                list = new List<DnsRecord>();
                _zones[zone] = list;
            }

            var fqdn = aliasName.EndsWith($".{zone}", StringComparison.OrdinalIgnoreCase) 
                ? aliasName 
                : $"{aliasName}.{zone}";
            // Replace if exists
            var existing = list.FirstOrDefault(r => string.Equals(r.HostName, fqdn, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                existing.IpAddress = targetHost;
                existing.RecordType = "CNAME";
                existing.TTL = 3600;
            }
            else
            {
                list.Add(new DnsRecord { HostName = fqdn, IpAddress = targetHost, RecordType = "CNAME", TTL = 3600 });
            }
        }
    }

    public DnsRemoveResult RemoveRecord(string zone, string hostname, string username, string password, string domain)
    {
        lock (_lock)
        {
            if (!_zones.TryGetValue(zone, out var list))
                return new DnsRemoveResult();

            var fqdn = hostname.EndsWith($".{zone}", StringComparison.OrdinalIgnoreCase)
                ? hostname
                : $"{hostname}.{zone}";
            var matches = list.Where(r => string.Equals(r.HostName, fqdn, StringComparison.OrdinalIgnoreCase)).ToList();
            var removedIps = matches.Where(r => r.RecordType == "A").Select(r => r.IpAddress).ToList();
            list.RemoveAll(matches.Contains);

            var result = new DnsRemoveResult { Deleted = matches.Count > 0 };

            // Remove the PTR records that point at this host
            var reverseZones = _zones.Keys.Where(z => z.EndsWith(".in-addr.arpa", StringComparison.OrdinalIgnoreCase)).ToList();
            foreach (var ip in removedIps)
            {
                var ptrOwner = ReverseDns.GetPtrOwnerName(ip);
                var reverseZone = ReverseDns.FindReverseZone(ptrOwner, reverseZones);
                if (reverseZone == null) continue;

                result.PtrDeleted += _zones[reverseZone].RemoveAll(r =>
                    r.RecordType == "PTR" &&
                    string.Equals(r.HostName, ptrOwner, StringComparison.OrdinalIgnoreCase) &&
                    ReverseDns.SameHost(r.IpAddress, fqdn));
            }

            return result;
        }
    }
}
