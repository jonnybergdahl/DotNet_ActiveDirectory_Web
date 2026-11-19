namespace Bergdahl.ActiveDirectory.Core.Models;

/// <summary>
/// Outcome of removing a host's records, including its associated PTR records.
/// </summary>
public class DnsRemoveResult
{
    /// <summary>True when at least one A or CNAME record was deleted.</summary>
    public bool Deleted { get; set; }

    /// <summary>How many PTR records pointing at the host were deleted.</summary>
    public int PtrDeleted { get; set; }

    /// <summary>Why a PTR record could not be deleted, or null when nothing went wrong.</summary>
    public string? PtrWarning { get; set; }
}
