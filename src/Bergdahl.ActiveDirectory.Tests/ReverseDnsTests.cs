using Bergdahl.ActiveDirectory.Core.ActiveDirectory;

namespace Bergdahl.ActiveDirectory.Tests;

public class ReverseDnsTests
{
    [Fact]
    public void GetPtrOwnerName_ReversesOctets()
    {
        Assert.Equal("50.0.0.10.in-addr.arpa", ReverseDns.GetPtrOwnerName("10.0.0.50"));
    }

    [Fact]
    public void GetPtrOwnerName_IPv6_Throws()
    {
        Assert.Throws<ArgumentException>(() => ReverseDns.GetPtrOwnerName("::1"));
    }

    [Fact]
    public void FindReverseZone_PicksMostSpecificZone()
    {
        var zones = new[] { "10.in-addr.arpa", "0.0.10.in-addr.arpa", "1.168.192.in-addr.arpa" };
        Assert.Equal("0.0.10.in-addr.arpa", ReverseDns.FindReverseZone("50.0.0.10.in-addr.arpa", zones));
        Assert.Equal("10.in-addr.arpa", ReverseDns.FindReverseZone("50.5.0.10.in-addr.arpa", zones));
    }

    [Fact]
    public void FindReverseZone_DoesNotMatchPartialLabel()
    {
        // "0.10.in-addr.arpa" must not match "100.10.in-addr.arpa"-style suffixes without a dot boundary
        var zones = new[] { "0.10.in-addr.arpa" };
        Assert.Null(ReverseDns.FindReverseZone("1.2.100.10.in-addr.arpa", zones));
    }

    [Fact]
    public void FindReverseZone_NoMatch_ReturnsNull()
    {
        Assert.Null(ReverseDns.FindReverseZone("50.0.0.10.in-addr.arpa", new[] { "1.168.192.in-addr.arpa" }));
    }
}
