namespace Bergdahl.ActiveDirectory.Core.ActiveDirectory;

using System.Net;
using System.Net.Sockets;

/// <summary>
/// Helpers for working out where the PTR record for an IPv4 address belongs.
/// </summary>
public static class ReverseDns
{
    /// <summary>
    /// Returns the PTR owner name for an IPv4 address, e.g. 10.0.0.50 -> 50.0.0.10.in-addr.arpa.
    /// </summary>
    public static string GetPtrOwnerName(string ip)
    {
        if (!IPAddress.TryParse(ip, out var address) || address.AddressFamily != AddressFamily.InterNetwork)
            throw new ArgumentException($"'{ip}' is not a valid IPv4 address", nameof(ip));

        var octets = address.GetAddressBytes();
        return $"{octets[3]}.{octets[2]}.{octets[1]}.{octets[0]}.in-addr.arpa";
    }

    /// <summary>
    /// Picks the most specific reverse lookup zone that contains the PTR owner name,
    /// or null when no zone matches (the same case where the DNS Manager GUI warns
    /// that the reverse lookup zone cannot be found).
    /// </summary>
    public static string? FindReverseZone(string ptrOwnerName, IEnumerable<string> reverseZones)
    {
        return reverseZones
            .Select(z => z.TrimEnd('.'))
            .Where(z => ptrOwnerName.Equals(z, StringComparison.OrdinalIgnoreCase) ||
                        ptrOwnerName.EndsWith("." + z, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(z => z.Length)
            .FirstOrDefault();
    }

    /// <summary>
    /// Compares two host names, ignoring case and a trailing dot.
    /// </summary>
    public static bool SameHost(string? a, string? b) =>
        string.Equals(a?.TrimEnd('.'), b?.TrimEnd('.'), StringComparison.OrdinalIgnoreCase);
}
