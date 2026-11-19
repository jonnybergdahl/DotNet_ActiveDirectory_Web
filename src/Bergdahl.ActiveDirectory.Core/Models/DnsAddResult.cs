namespace Bergdahl.ActiveDirectory.Core.Models;

/// <summary>
/// Outcome of adding an A record. The A record itself was created; the PTR
/// fields say what happened to the associated reverse lookup record.
/// </summary>
public class DnsAddResult
{
    /// <summary>True when the PTR record exists after the call (created now or already present).</summary>
    public bool PtrCreated { get; set; }

    /// <summary>The reverse lookup zone the PTR record was placed in, if one was found.</summary>
    public string? ReverseZone { get; set; }

    /// <summary>Why the PTR record could not be created, or null when it was.</summary>
    public string? PtrWarning { get; set; }
}
