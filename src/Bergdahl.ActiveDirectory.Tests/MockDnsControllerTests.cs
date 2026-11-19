using Bergdahl.ActiveDirectory.Core.Models;
using Bergdahl.ActiveDirectory.Mock;
using Bergdahl.ActiveDirectory.Web.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace Bergdahl.ActiveDirectory.Tests;

public class MockDnsControllerTests
{
    private readonly DnsController _controller;
    private readonly MockDnsWmiService _mockService;
    private readonly ApplicationSettings _settings;

    public MockDnsControllerTests()
    {
        _mockService = new MockDnsWmiService();
        _settings = new ApplicationSettings
        {
            ActiveDirectoryDomain = "example.com",
            DnsZones = new List<string> { "example.com" }
        };
        var options = Options.Create(_settings);
        
        _controller = new DnsController(_mockService, options);
        
        // Mock HttpContext and Session
        var mockHttpContext = new Mock<HttpContext>();
        var mockSession = new Mock<ISession>();
        
        byte[] userBytes = System.Text.Encoding.UTF8.GetBytes("testuser");
        byte[] passBytes = System.Text.Encoding.UTF8.GetBytes("testpass");
        
        mockSession.Setup(s => s.TryGetValue("adUser", out userBytes)).Returns(true);
        mockSession.Setup(s => s.TryGetValue("adPass", out passBytes)).Returns(true);
        
        mockHttpContext.Setup(h => h.Session).Returns(mockSession.Object);
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = mockHttpContext.Object
        };
    }

    [Fact]
    public void GetZones_ReturnsConfiguredZones()
    {
        // Act
        var result = _controller.GetZones();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var zones = Assert.IsType<List<string>>(okResult.Value);
        Assert.Single(zones);
        Assert.Equal("example.com", zones[0]);
    }

    [Fact]
    public void GetRecords_ReturnsRecordsForZone()
    {
        // Act
        var result = _controller.GetRecords("example.com");

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var records = Assert.IsType<List<DnsRecord>>(okResult.Value);
        // MockDnsWmiService pre-populates example.com with 2 records
        Assert.NotEmpty(records);
    }

    [Fact]
    public void RemoveRecord_NoIpAddress_ReturnsOk()
    {
        // Act
        var req = new Bergdahl.ActiveDirectory.Web.Models.DnsRequest 
        { 
            Zone = "example.com", 
            Hostname = "www" // www.example.com exists in MockDnsWmiService
        };
        var result = _controller.RemoveRecord(req);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = Newtonsoft.Json.Linq.JObject.FromObject(okResult.Value);
        Assert.Contains("Deleted", json["message"].ToString());
    }

    [Fact]
    public void RemoveRecord_NonExistentRecord_ReturnsBadRequest()
    {
        // Act
        var req = new Bergdahl.ActiveDirectory.Web.Models.DnsRequest 
        { 
            Zone = "example.com", 
            Hostname = "nonexistent" 
        };
        var result = _controller.RemoveRecord(req);

        // Assert
        var badResult = Assert.IsType<BadRequestObjectResult>(result);
        var json = Newtonsoft.Json.Linq.JObject.FromObject(badResult.Value);
        Assert.Contains("not found", json["message"].ToString());
    }

    [Fact]
    public void RemoveRecord_InvalidHostname_ReturnsBadRequest()
    {
        // Act
        var req = new Bergdahl.ActiveDirectory.Web.Models.DnsRequest 
        { 
            Zone = "example.com", 
            Hostname = "invalid!hostname" // ! not allowed
        };
        var result = _controller.RemoveRecord(req);

        // Assert
        var badResult = Assert.IsType<BadRequestObjectResult>(result);
        var json = Newtonsoft.Json.Linq.JObject.FromObject(badResult.Value);
        Assert.Equal("Invalid hostname", json["message"].ToString());
    }

    [Fact]
    public void RemoveRecord_Fqdn_ReturnsOk()
    {
        // Act
        var req = new Bergdahl.ActiveDirectory.Web.Models.DnsRequest 
        { 
            Zone = "example.com", 
            Hostname = "www.example.com" 
        };
        var result = _controller.RemoveRecord(req);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = Newtonsoft.Json.Linq.JObject.FromObject(okResult.Value);
        Assert.Contains("Deleted", json["message"].ToString());
    }

    [Fact]
    public void AddRecord_IpInReverseZone_CreatesPtrRecord()
    {
        var req = new Bergdahl.ActiveDirectory.Web.Models.DnsRequest
        {
            Zone = "example.com",
            Hostname = "web01",
            IpAddress = "192.168.1.50"
        };
        var result = _controller.AddRecord(req);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = Newtonsoft.Json.Linq.JObject.FromObject(okResult.Value!);
        Assert.Contains("PTR record in 1.168.192.in-addr.arpa", json["message"]!.ToString());
        Assert.Equal(Newtonsoft.Json.Linq.JTokenType.Null, json["warning"]!.Type);

        var ptrs = _mockService.GetRecords("1.168.192.in-addr.arpa", "u", "p", "example.com");
        var ptr = Assert.Single(ptrs, r => r.HostName == "50.1.168.192.in-addr.arpa");
        Assert.Equal("PTR", ptr.RecordType);
        Assert.Equal("web01.example.com.", ptr.IpAddress);
    }

    [Fact]
    public void AddRecord_IpWithoutReverseZone_KeepsARecordAndWarns()
    {
        var req = new Bergdahl.ActiveDirectory.Web.Models.DnsRequest
        {
            Zone = "example.com",
            Hostname = "web02",
            IpAddress = "10.0.0.50"
        };
        var result = _controller.AddRecord(req);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = Newtonsoft.Json.Linq.JObject.FromObject(okResult.Value!);
        Assert.Contains("no reverse lookup zone", json["warning"]!.ToString());

        var records = _mockService.GetRecords("example.com", "u", "p", "example.com");
        Assert.Contains(records, r => r.HostName == "web02.example.com" && r.IpAddress == "10.0.0.50");
    }

    [Fact]
    public void AddRecord_ExistingPtr_IsNotDuplicated()
    {
        var req = new Bergdahl.ActiveDirectory.Web.Models.DnsRequest
        {
            Zone = "example.com",
            Hostname = "www", // www.example.com -> 192.168.1.10 already has a PTR record
            IpAddress = "192.168.1.10"
        };
        Assert.IsType<OkObjectResult>(_controller.AddRecord(req));

        var ptrs = _mockService.GetRecords("1.168.192.in-addr.arpa", "u", "p", "example.com");
        Assert.Single(ptrs, r => r.HostName == "10.1.168.192.in-addr.arpa");
    }

    [Fact]
    public void RemoveRecord_ARecord_AlsoDeletesItsPtrRecord()
    {
        var req = new Bergdahl.ActiveDirectory.Web.Models.DnsRequest
        {
            Zone = "example.com",
            Hostname = "www" // www.example.com -> 192.168.1.10 has a PTR record
        };
        var result = _controller.RemoveRecord(req);

        var okResult = Assert.IsType<OkObjectResult>(result);
        var json = Newtonsoft.Json.Linq.JObject.FromObject(okResult.Value!);
        Assert.Contains("and its PTR record", json["message"]!.ToString());

        var ptrs = _mockService.GetRecords("1.168.192.in-addr.arpa", "u", "p", "example.com");
        Assert.DoesNotContain(ptrs, r => r.HostName == "10.1.168.192.in-addr.arpa");
        Assert.Contains(ptrs, r => r.HostName == "20.1.168.192.in-addr.arpa"); // api is untouched
    }

    [Fact]
    public void RemoveRecord_KeepsPtrForOtherHostOnSameIp()
    {
        // Two hosts share 192.168.1.10; each gets its own PTR record
        _controller.AddRecord(new Bergdahl.ActiveDirectory.Web.Models.DnsRequest
        {
            Zone = "example.com",
            Hostname = "alias01",
            IpAddress = "192.168.1.10"
        });

        _controller.RemoveRecord(new Bergdahl.ActiveDirectory.Web.Models.DnsRequest
        {
            Zone = "example.com",
            Hostname = "www"
        });

        var ptrs = _mockService.GetRecords("1.168.192.in-addr.arpa", "u", "p", "example.com");
        var remaining = Assert.Single(ptrs, r => r.HostName == "10.1.168.192.in-addr.arpa");
        Assert.Equal("alias01.example.com.", remaining.IpAddress);
    }

    [Theory]
    [InlineData("10.1")]
    [InlineData("::1")]
    [InlineData("300.1.1.1")]
    public void AddRecord_NotFullIPv4_ReturnsBadRequest(string ip)
    {
        var req = new Bergdahl.ActiveDirectory.Web.Models.DnsRequest
        {
            Zone = "example.com",
            Hostname = "web03",
            IpAddress = ip
        };
        Assert.IsType<BadRequestObjectResult>(_controller.AddRecord(req));
    }
}
