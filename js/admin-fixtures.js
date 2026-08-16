window.BloodConnectAdminFixtures = (() => {
    const datasets = {
        donors: { title: "Donors", description: "View donor availability and verification status.", columns: ["Donor", "Blood group", "City", "Availability", "Status"], rows: [["Riya Patel", "A+", "Pune", "Available", "Verified"], ["Arjun Singh", "O-", "Delhi", "Unavailable", "Verified"], ["Neha Joshi", "B+", "Mumbai", "Available", "Pending"]] },
        stock: { title: "Blood Stock", description: "Monitor fixture inventory by blood group.", columns: ["Blood group", "Units", "Threshold", "Condition", "Updated"], rows: [["A+", "32", "20", "Healthy", "Today"], ["O-", "5", "12", "Critical", "Today"], ["B-", "9", "10", "Low", "Yesterday"]] },
        banks: { title: "Blood Banks", description: "Browse registered blood-bank facilities.", columns: ["Blood bank", "City", "Contact", "Availability", "Status"], rows: [["Red Hope Centre", "Mumbai", "+91 90000 10001", "Open", "Verified"], ["LifeLine Bank", "Pune", "+91 90000 10002", "Open", "Pending"]] },
        hospitals: { title: "Hospitals", description: "Review participating hospital accounts.", columns: ["Hospital", "City", "Contact", "Requests", "Status"], rows: [["City Care Hospital", "Mumbai", "+91 90000 20001", "8", "Active"], ["Unity Hospital", "Nashik", "+91 90000 20002", "3", "Pending"]] },
        users: { title: "Users", description: "Read-only preview of user account administration.", columns: ["User", "Role", "Status", "Last active", "Access"], rows: [["Operations Admin", "Admin", "Active", "Today", "Operational"], ["Demo Donor", "Donor", "Active", "Yesterday", "Standard"]] }
    };
    const bloodRequests = [
        { id: "BR-2026-1042", patient: "Aarav Mehta", bloodGroup: "O+", hospital: "City Care Hospital", hospitalAddress: "Andheri East, Mumbai", mobile: "+91 98765 41001", address: "Marol, Mumbai, Maharashtra", createdAt: "2026-08-13T08:48:00+05:30", status: "New", priority: "Urgent", assignment: "Unassigned", fulfillment: "Awaiting review", timeline: [["Request submitted", "13 Aug, 8:48 AM", "Public request received"], ["Urgency flagged", "13 Aug, 8:49 AM", "Fixture triage rule"]] },
        { id: "BR-2026-1041", patient: "Meera Shah", bloodGroup: "B-", hospital: "Sunrise Medical", hospitalAddress: "Baner, Pune", mobile: "+91 98765 41002", address: "Aundh, Pune, Maharashtra", createdAt: "2026-08-13T08:22:00+05:30", status: "Under Review", priority: "High", assignment: "Pune response desk", fulfillment: "Verification in progress", timeline: [["Request submitted", "13 Aug, 8:22 AM", "Public request received"], ["Review started", "13 Aug, 8:31 AM", "Assigned to fixture desk"]] },
        { id: "BR-2026-1040", patient: "Kabir Rao", bloodGroup: "AB+", hospital: "Unity Hospital", hospitalAddress: "College Road, Nashik", mobile: "+91 98765 41003", address: "Gangapur Road, Nashik", createdAt: "2026-08-13T07:55:00+05:30", status: "Assigned", priority: "Standard", assignment: "Red Hope Centre", fulfillment: "2 units reserved", timeline: [["Request submitted", "13 Aug, 7:55 AM", "Public request received"], ["Approved", "13 Aug, 8:10 AM", "Fixture Admin"], ["Assigned", "13 Aug, 8:18 AM", "Red Hope Centre"]] },
        { id: "BR-2026-1039", patient: "Saanvi Iyer", bloodGroup: "A-", hospital: "Lotus Hospital", hospitalAddress: "Indiranagar, Bengaluru", mobile: "+91 98765 41004", address: "Domlur, Bengaluru", createdAt: "2026-08-12T19:20:00+05:30", status: "Approved", priority: "High", assignment: "Awaiting blood bank", fulfillment: "Approved for 1 unit", timeline: [["Request submitted", "12 Aug, 7:20 PM", "Public request received"], ["Approved", "12 Aug, 7:45 PM", "Fixture Admin"]] },
        { id: "BR-2026-1038", patient: "Vihaan Gupta", bloodGroup: "O-", hospital: "Metro Health", hospitalAddress: "Dwarka, Delhi", mobile: "+91 98765 41005", address: "Janakpuri, Delhi", createdAt: "2026-08-12T17:05:00+05:30", status: "Fulfilled", priority: "Urgent", assignment: "LifeSource Bank", fulfillment: "2 units delivered", timeline: [["Request submitted", "12 Aug, 5:05 PM", "Public request received"], ["Assigned", "12 Aug, 5:18 PM", "LifeSource Bank"], ["Fulfilled", "12 Aug, 6:02 PM", "Hospital receipt confirmed"]] },
        { id: "BR-2026-1037", patient: "Anaya Nair", bloodGroup: "A+", hospital: "Harbor Medical", hospitalAddress: "Kochi, Kerala", mobile: "+91 98765 41006", address: "Vyttila, Kochi", createdAt: "2026-08-12T14:42:00+05:30", status: "Rejected", priority: "Standard", assignment: "Unassigned", fulfillment: "Duplicate details", timeline: [["Request submitted", "12 Aug, 2:42 PM", "Public request received"], ["Rejected", "12 Aug, 3:10 PM", "Fixture duplicate review"]] },
        { id: "BR-2026-1036", patient: "Reyansh Verma", bloodGroup: "B+", hospital: "North Star Hospital", hospitalAddress: "Lucknow, Uttar Pradesh", mobile: "+91 98765 41007", address: "Gomti Nagar, Lucknow", createdAt: "2026-08-11T16:35:00+05:30", status: "Cancelled", priority: "Standard", assignment: "Unassigned", fulfillment: "Cancelled by requester", timeline: [["Request submitted", "11 Aug, 4:35 PM", "Public request received"], ["Cancelled", "11 Aug, 5:02 PM", "Requester contacted hospital"]] },
        { id: "BR-2026-1035", patient: "Myra Kapoor", bloodGroup: "AB-", hospital: "Green Valley Hospital", hospitalAddress: "Jaipur, Rajasthan", mobile: "+91 98765 41008", address: "Malviya Nagar, Jaipur", createdAt: "2026-08-11T11:15:00+05:30", status: "New", priority: "High", assignment: "Unassigned", fulfillment: "Awaiting review", timeline: [["Request submitted", "11 Aug, 11:15 AM", "Public request received"]] },
        { id: "BR-2026-1034", patient: "Advait Kulkarni", bloodGroup: "O+", hospital: "Sahyadri Care", hospitalAddress: "Kothrud, Pune", mobile: "+91 98765 41009", address: "Karve Nagar, Pune", createdAt: "2026-08-10T13:30:00+05:30", status: "Under Review", priority: "Standard", assignment: "Pune response desk", fulfillment: "Contact confirmed", timeline: [["Request submitted", "10 Aug, 1:30 PM", "Public request received"], ["Contact verified", "10 Aug, 1:44 PM", "Fixture desk"]] },
        { id: "BR-2026-1033", patient: "Ishita Bose", bloodGroup: "B-", hospital: "Eastern Medical", hospitalAddress: "Salt Lake, Kolkata", mobile: "+91 98765 41010", address: "New Town, Kolkata", createdAt: "2026-08-09T09:10:00+05:30", status: "Assigned", priority: "High", assignment: "Kolkata Blood Network", fulfillment: "1 unit reserved", timeline: [["Request submitted", "9 Aug, 9:10 AM", "Public request received"], ["Assigned", "9 Aug, 9:48 AM", "Kolkata Blood Network"]] },
        { id: "BR-2026-1032", patient: "Arnav Reddy", bloodGroup: "A+", hospital: "Deccan Hospital", hospitalAddress: "Banjara Hills, Hyderabad", mobile: "+91 98765 41011", address: "Jubilee Hills, Hyderabad", createdAt: "2026-08-08T20:25:00+05:30", status: "Fulfilled", priority: "Standard", assignment: "Deccan Blood Centre", fulfillment: "1 unit delivered", timeline: [["Request submitted", "8 Aug, 8:25 PM", "Public request received"], ["Fulfilled", "8 Aug, 9:40 PM", "Hospital receipt confirmed"]] },
        { id: "BR-2026-1031", patient: "Diya Menon", bloodGroup: "O-", hospital: "Coastal Care", hospitalAddress: "Chennai, Tamil Nadu", mobile: "+91 98765 41012", address: "Adyar, Chennai", createdAt: "2026-08-07T10:50:00+05:30", status: "Approved", priority: "Urgent", assignment: "Awaiting blood bank", fulfillment: "Approved for 2 units", timeline: [["Request submitted", "7 Aug, 10:50 AM", "Public request received"], ["Approved", "7 Aug, 11:02 AM", "Fixture Admin"]] }
    ];
    const donorRecords = [
        { id: "DN-2026-0186", fullName: "Riya Patel", bloodGroup: "A+", mobile: "+91 98765 52001", email: "riya.fixture@example.test", location: "Pune, Maharashtra", lastDonation: "2026-04-18", availability: "Available", status: "Verified", registeredAt: "2026-08-12T10:20:00+05:30", donations: 4, timeline: [["Registration submitted", "12 Aug 2026", "Fixture public form"], ["Identity verified", "12 Aug 2026", "Fixture Admin review"], ["Availability confirmed", "13 Aug 2026", "Fixture donor response"]] },
        { id: "DN-2026-0185", fullName: "Arjun Singh", bloodGroup: "O-", mobile: "+91 98765 52002", email: "arjun.fixture@example.test", location: "Delhi", lastDonation: "2026-06-02", availability: "Unavailable", status: "Verified", registeredAt: "2026-08-11T14:05:00+05:30", donations: 7, timeline: [["Registration submitted", "11 Aug 2026", "Fixture public form"], ["Identity verified", "11 Aug 2026", "Fixture Admin review"]] },
        { id: "DN-2026-0184", fullName: "Neha Joshi", bloodGroup: "B+", mobile: "+91 98765 52003", email: "neha.fixture@example.test", location: "Mumbai, Maharashtra", lastDonation: null, availability: "Available", status: "Pending", registeredAt: "2026-08-10T09:45:00+05:30", donations: 0, timeline: [["Registration submitted", "10 Aug 2026", "Fixture public form"], ["Review queued", "10 Aug 2026", "Awaiting fixture verification"]] },
        { id: "DN-2026-0183", fullName: "Vikram Nair", bloodGroup: "AB+", mobile: "+91 98765 52004", email: "vikram.fixture@example.test", location: "Kochi, Kerala", lastDonation: "2026-01-14", availability: "Available", status: "Verified", registeredAt: "2026-08-09T16:15:00+05:30", donations: 2, timeline: [["Registration submitted", "9 Aug 2026", "Fixture public form"], ["Identity verified", "9 Aug 2026", "Fixture Admin review"]] },
        { id: "DN-2026-0182", fullName: "Sana Khan", bloodGroup: "B-", mobile: "+91 98765 52005", email: "sana.fixture@example.test", location: "Hyderabad, Telangana", lastDonation: "2026-05-21", availability: "Unavailable", status: "Inactive", registeredAt: "2026-08-08T11:32:00+05:30", donations: 3, timeline: [["Registration submitted", "8 Aug 2026", "Fixture public form"], ["Account deactivated", "12 Aug 2026", "Fixture donor request"]] },
        { id: "DN-2026-0181", fullName: "Rohan Das", bloodGroup: "O+", mobile: "+91 98765 52006", email: "rohan.fixture@example.test", location: "Kolkata, West Bengal", lastDonation: "2026-03-08", availability: "Available", status: "Verified", registeredAt: "2026-08-07T13:40:00+05:30", donations: 5, timeline: [["Registration submitted", "7 Aug 2026", "Fixture public form"], ["Identity verified", "7 Aug 2026", "Fixture Admin review"]] },
        { id: "DN-2026-0180", fullName: "Isha Rao", bloodGroup: "A-", mobile: "+91 98765 52007", email: "isha.fixture@example.test", location: "Bengaluru, Karnataka", lastDonation: null, availability: "Available", status: "Pending", registeredAt: "2026-08-06T08:55:00+05:30", donations: 0, timeline: [["Registration submitted", "6 Aug 2026", "Fixture public form"], ["Review queued", "6 Aug 2026", "Awaiting fixture verification"]] },
        { id: "DN-2026-0179", fullName: "Dev Mehta", bloodGroup: "AB-", mobile: "+91 98765 52008", email: "dev.fixture@example.test", location: "Ahmedabad, Gujarat", lastDonation: "2025-12-19", availability: "Unavailable", status: "Verified", registeredAt: "2026-08-05T17:25:00+05:30", donations: 1, timeline: [["Registration submitted", "5 Aug 2026", "Fixture public form"], ["Identity verified", "5 Aug 2026", "Fixture Admin review"]] },
        { id: "DN-2026-0178", fullName: "Tara Menon", bloodGroup: "O-", mobile: "+91 98765 52009", email: "tara.fixture@example.test", location: "Chennai, Tamil Nadu", lastDonation: "2026-07-01", availability: "Available", status: "Verified", registeredAt: "2026-08-04T12:10:00+05:30", donations: 6, timeline: [["Registration submitted", "4 Aug 2026", "Fixture public form"], ["Identity verified", "4 Aug 2026", "Fixture Admin review"]] },
        { id: "DN-2026-0177", fullName: "Kunal Verma", bloodGroup: "A+", mobile: "+91 98765 52010", email: "kunal.fixture@example.test", location: "Lucknow, Uttar Pradesh", lastDonation: "2026-02-27", availability: "Available", status: "Rejected", registeredAt: "2026-08-03T10:05:00+05:30", donations: 2, timeline: [["Registration submitted", "3 Aug 2026", "Fixture public form"], ["Registration rejected", "3 Aug 2026", "Fixture details incomplete"]] }
    ];
    const stockStatusThresholds = Object.freeze({ criticalMaximum: 6, lowMaximum: 12 });
    const bloodStock = [
        { id: "STK-RHC-A-POS", bloodGroup: "A+", availableUnits: 32, reservedUnits: 4, bloodBank: "Red Hope Centre", location: "Mumbai, Maharashtra", updatedAt: "2026-08-13T09:18:00+05:30", activity: [["Collection received", "+8 units", "13 Aug 2026, 9:18 AM"], ["Reservation created", "-4 available / +4 reserved", "13 Aug 2026, 8:40 AM"]] },
        { id: "STK-RHC-O-NEG", bloodGroup: "O-", availableUnits: 5, reservedUnits: 2, bloodBank: "Red Hope Centre", location: "Mumbai, Maharashtra", updatedAt: "2026-08-13T08:42:00+05:30", activity: [["Units reserved", "2 units", "13 Aug 2026, 8:42 AM"], ["Fixture count verified", "No change", "12 Aug 2026, 6:10 PM"]] },
        { id: "STK-LLB-B-POS", bloodGroup: "B+", availableUnits: 28, reservedUnits: 3, bloodBank: "LifeLine Bank", location: "Pune, Maharashtra", updatedAt: "2026-08-13T07:55:00+05:30", activity: [["Collection received", "+6 units", "13 Aug 2026, 7:55 AM"]] },
        { id: "STK-LLB-B-NEG", bloodGroup: "B-", availableUnits: 9, reservedUnits: 1, bloodBank: "LifeLine Bank", location: "Pune, Maharashtra", updatedAt: "2026-08-12T17:25:00+05:30", activity: [["Request fulfilled", "-1 unit", "12 Aug 2026, 5:25 PM"]] },
        { id: "STK-DCB-AB-POS", bloodGroup: "AB+", availableUnits: 17, reservedUnits: 0, bloodBank: "Deccan Blood Centre", location: "Hyderabad, Telangana", updatedAt: "2026-08-12T15:10:00+05:30", activity: [["Fixture count verified", "No change", "12 Aug 2026, 3:10 PM"]] },
        { id: "STK-DCB-AB-NEG", bloodGroup: "AB-", availableUnits: 6, reservedUnits: 1, bloodBank: "Deccan Blood Centre", location: "Hyderabad, Telangana", updatedAt: "2026-08-12T12:05:00+05:30", activity: [["Reservation released", "+1 available / -1 reserved", "12 Aug 2026, 12:05 PM"]] },
        { id: "STK-KBN-O-POS", bloodGroup: "O+", availableUnits: 16, reservedUnits: 5, bloodBank: "Kolkata Blood Network", location: "Kolkata, West Bengal", updatedAt: "2026-08-11T18:30:00+05:30", activity: [["Units reserved", "5 units", "11 Aug 2026, 6:30 PM"]] },
        { id: "STK-KBN-A-NEG", bloodGroup: "A-", availableUnits: 11, reservedUnits: 2, bloodBank: "Kolkata Blood Network", location: "Kolkata, West Bengal", updatedAt: "2026-08-11T14:15:00+05:30", activity: [["Manual fixture correction", "+1 unit", "11 Aug 2026, 2:15 PM"]] },
        { id: "STK-CSC-A-POS", bloodGroup: "A+", availableUnits: 14, reservedUnits: 1, bloodBank: "Coastal Support Centre", location: "Chennai, Tamil Nadu", updatedAt: "2026-08-10T16:45:00+05:30", activity: [["Request fulfilled", "-2 units", "10 Aug 2026, 4:45 PM"]] },
        { id: "STK-CSC-O-NEG", bloodGroup: "O-", availableUnits: 4, reservedUnits: 0, bloodBank: "Coastal Support Centre", location: "Chennai, Tamil Nadu", updatedAt: "2026-08-10T10:20:00+05:30", activity: [["Fixture count verified", "No change", "10 Aug 2026, 10:20 AM"]] },
        { id: "STK-NBC-B-NEG", bloodGroup: "B-", availableUnits: 12, reservedUnits: 2, bloodBank: "North Blood Centre", location: "Delhi", updatedAt: "2026-08-09T13:35:00+05:30", activity: [["Collection received", "+4 units", "9 Aug 2026, 1:35 PM"]] },
        { id: "STK-NBC-AB-POS", bloodGroup: "AB+", availableUnits: 21, reservedUnits: 2, bloodBank: "North Blood Centre", location: "Delhi", updatedAt: "2026-08-08T11:00:00+05:30", activity: [["Reservation released", "+2 available / -2 reserved", "8 Aug 2026, 11:00 AM"]] }
    ];
    const bloodBanks = [
        { id: "BB-2026-0014", name: "Red Hope Centre", contact: "+91 90000 10001", email: "contact.redhope@example.test", address: "12 Andheri Health Corridor", city: "Mumbai", district: "Mumbai Suburban", state: "Maharashtra", status: "Active", registeredAt: "2025-11-18T10:30:00+05:30", updatedAt: "2026-08-13T09:18:00+05:30", activity: [["Stock report received", "13 Aug 2026", "Fixture inventory sync"], ["Facility activated", "19 Nov 2025", "Fixture Admin approval"]] },
        { id: "BB-2026-0013", name: "LifeLine Bank", contact: "+91 90000 10002", email: "desk.lifeline@example.test", address: "44 Baner Service Road", city: "Pune", district: "Pune", state: "Maharashtra", status: "Active", registeredAt: "2025-12-06T12:15:00+05:30", updatedAt: "2026-08-13T07:55:00+05:30", activity: [["Stock report received", "13 Aug 2026", "Fixture inventory sync"], ["Facility activated", "7 Dec 2025", "Fixture Admin approval"]] },
        { id: "BB-2026-0012", name: "Deccan Blood Centre", contact: "+91 90000 10003", email: "operations.deccan@example.test", address: "8 Banjara Hills Main Road", city: "Hyderabad", district: "Hyderabad", state: "Telangana", status: "Active", registeredAt: "2026-01-09T09:40:00+05:30", updatedAt: "2026-08-12T15:10:00+05:30", activity: [["Stock count verified", "12 Aug 2026", "Fixture operational review"]] },
        { id: "BB-2026-0011", name: "Kolkata Blood Network", contact: "+91 90000 10004", email: "support.kbn@example.test", address: "21 Salt Lake Sector V", city: "Kolkata", district: "Kolkata", state: "West Bengal", status: "Active", registeredAt: "2026-01-22T14:20:00+05:30", updatedAt: "2026-08-11T18:30:00+05:30", activity: [["Reservation activity received", "11 Aug 2026", "Fixture request link"]] },
        { id: "BB-2026-0010", name: "Coastal Support Centre", contact: "+91 90000 10005", email: "coastal.support@example.test", address: "16 Adyar Medical Lane", city: "Chennai", district: "Chennai", state: "Tamil Nadu", status: "Active", registeredAt: "2026-02-03T11:05:00+05:30", updatedAt: "2026-08-10T16:45:00+05:30", activity: [["Stock report received", "10 Aug 2026", "Fixture inventory sync"]] },
        { id: "BB-2026-0009", name: "North Blood Centre", contact: "+91 90000 10006", email: "north.centre@example.test", address: "5 Dwarka Health Plaza", city: "Delhi", district: "South West Delhi", state: "Delhi", status: "Active", registeredAt: "2026-02-18T16:25:00+05:30", updatedAt: "2026-08-09T13:35:00+05:30", activity: [["Collection recorded", "9 Aug 2026", "Fixture stock activity"]] },
        { id: "BB-2026-0008", name: "Western Care Blood Bank", contact: "+91 90000 10007", email: "western.care@example.test", address: "30 Navrangpura Cross Road", city: "Ahmedabad", district: "Ahmedabad", state: "Gujarat", status: "Pending", registeredAt: "2026-08-08T10:10:00+05:30", updatedAt: "2026-08-12T10:05:00+05:30", activity: [["Registration submitted", "8 Aug 2026", "Awaiting fixture review"]] },
        { id: "BB-2026-0007", name: "Lake City Donation Centre", contact: "+91 90000 10008", email: "lakecity@example.test", address: "17 MP Nagar Zone II", city: "Bhopal", district: "Bhopal", state: "Madhya Pradesh", status: "Pending", registeredAt: "2026-08-06T13:50:00+05:30", updatedAt: "2026-08-11T09:20:00+05:30", activity: [["Registration submitted", "6 Aug 2026", "Awaiting fixture review"]] },
        { id: "BB-2026-0006", name: "Central Life Bank", contact: "+91 90000 10009", email: "central.life@example.test", address: "9 Civil Lines", city: "Jaipur", district: "Jaipur", state: "Rajasthan", status: "Inactive", registeredAt: "2026-03-12T10:45:00+05:30", updatedAt: "2026-08-07T15:00:00+05:30", activity: [["Facility deactivated", "7 Aug 2026", "Fixture operational pause"]] },
        { id: "BB-2026-0005", name: "Valley Blood Services", contact: "+91 90000 10010", email: "valley.services@example.test", address: "6 Rajpur Road", city: "Dehradun", district: "Dehradun", state: "Uttarakhand", status: "Decommissioned", registeredAt: "2025-10-14T09:15:00+05:30", updatedAt: "2026-07-28T12:30:00+05:30", activity: [["Facility decommissioned", "28 Jul 2026", "Fixture closure record"]] }
    ];
    const hospitals = [
        { id: "HSP-2026-0027", name: "City Care Hospital", contact: "+91 90000 20001", email: "requests.citycare@example.test", address: "18 Marol Health Road", city: "Mumbai", district: "Mumbai Suburban", state: "Maharashtra", status: "Active", registeredAt: "2025-10-22T10:15:00+05:30", updatedAt: "2026-08-13T08:50:00+05:30", activity: [["Request received", "13 Aug 2026", "Fixture blood request linked"], ["Hospital activated", "23 Oct 2025", "Fixture Admin approval"]] },
        { id: "HSP-2026-0026", name: "Sunrise Medical", contact: "+91 90000 20002", email: "blooddesk.sunrise@example.test", address: "27 Baner High Street", city: "Pune", district: "Pune", state: "Maharashtra", status: "Active", registeredAt: "2025-11-14T11:30:00+05:30", updatedAt: "2026-08-13T08:31:00+05:30", activity: [["Request review started", "13 Aug 2026", "Fixture request workflow"]] },
        { id: "HSP-2026-0025", name: "Unity Hospital", contact: "+91 90000 20003", email: "care.unity@example.test", address: "40 College Road", city: "Nashik", district: "Nashik", state: "Maharashtra", status: "Active", registeredAt: "2025-12-02T09:45:00+05:30", updatedAt: "2026-08-13T08:18:00+05:30", activity: [["Request assigned", "13 Aug 2026", "Fixture fulfillment workflow"]] },
        { id: "HSP-2026-0024", name: "Lotus Hospital", contact: "+91 90000 20004", email: "admin.lotus@example.test", address: "11 Indiranagar Main Road", city: "Bengaluru", district: "Bengaluru Urban", state: "Karnataka", status: "Active", registeredAt: "2026-01-06T14:10:00+05:30", updatedAt: "2026-08-12T19:45:00+05:30", activity: [["Request approved", "12 Aug 2026", "Fixture request workflow"]] },
        { id: "HSP-2026-0023", name: "Metro Health", contact: "+91 90000 20005", email: "desk.metro@example.test", address: "7 Dwarka Sector 9", city: "Delhi", district: "South West Delhi", state: "Delhi", status: "Active", registeredAt: "2026-01-20T13:25:00+05:30", updatedAt: "2026-08-12T18:02:00+05:30", activity: [["Fulfillment confirmed", "12 Aug 2026", "Fixture hospital receipt"]] },
        { id: "HSP-2026-0022", name: "Harbor Medical", contact: "+91 90000 20006", email: "support.harbor@example.test", address: "23 Vyttila Junction", city: "Kochi", district: "Ernakulam", state: "Kerala", status: "Active", registeredAt: "2026-02-08T10:55:00+05:30", updatedAt: "2026-08-12T15:10:00+05:30", activity: [["Duplicate request review completed", "12 Aug 2026", "Fixture workflow"]] },
        { id: "HSP-2026-0021", name: "North Star Hospital", contact: "+91 90000 20007", email: "northstar@example.test", address: "32 Gomti Nagar Extension", city: "Lucknow", district: "Lucknow", state: "Uttar Pradesh", status: "Active", registeredAt: "2026-02-25T16:40:00+05:30", updatedAt: "2026-08-11T17:02:00+05:30", activity: [["Request cancelled", "11 Aug 2026", "Fixture requester update"]] },
        { id: "HSP-2026-0020", name: "Green Valley Hospital", contact: "+91 90000 20008", email: "greenvalley@example.test", address: "15 Malviya Nagar", city: "Jaipur", district: "Jaipur", state: "Rajasthan", status: "Pending", registeredAt: "2026-08-05T12:20:00+05:30", updatedAt: "2026-08-11T11:15:00+05:30", activity: [["Registration submitted", "5 Aug 2026", "Awaiting fixture review"], ["Request linked", "11 Aug 2026", "Fixture request received"]] },
        { id: "HSP-2026-0019", name: "Sahyadri Care", contact: "+91 90000 20009", email: "sahyadri.care@example.test", address: "26 Kothrud Depot Road", city: "Pune", district: "Pune", state: "Maharashtra", status: "Inactive", registeredAt: "2026-03-04T09:35:00+05:30", updatedAt: "2026-08-10T13:44:00+05:30", activity: [["Facility deactivated", "10 Aug 2026", "Fixture operational pause"]] },
        { id: "HSP-2026-0018", name: "Eastern Medical", contact: "+91 90000 20010", email: "eastern.medical@example.test", address: "19 Salt Lake Sector II", city: "Kolkata", district: "Kolkata", state: "West Bengal", status: "Decommissioned", registeredAt: "2025-09-18T15:05:00+05:30", updatedAt: "2026-08-09T09:48:00+05:30", activity: [["Facility decommissioned", "9 Aug 2026", "Fixture closure record"]] }
    ];
    const users = [
        { id: "USR-2026-0231", authUserId: "fixture-auth-admin-current", fullName: "Operations Admin", mobile: "+91 98800 61001", email: "operations.admin@example.test", role: "Admin", status: "Active", isCurrentActor: true, createdAt: "2025-09-10T09:00:00+05:30", lastLoginAt: "2026-08-13T09:35:00+05:30", updatedAt: "2026-08-12T16:20:00+05:30", permissions: { effective: ["request.read", "donor.read", "stock.read", "blood_bank.read", "hospital.read", "user.read", "demo.read"], denied: ["authorization.manage", "security.configure", "super_admin.assign"] }, activity: [["Signed in", "13 Aug 2026", "Fixture Admin session"], ["Profile reviewed", "12 Aug 2026", "No role or status change"]] },
        { id: "USR-2026-0230", authUserId: "fixture-auth-admin-2", fullName: "Regional Admin", mobile: "+91 98800 61002", email: "regional.admin@example.test", role: "Admin", status: "Active", isCurrentActor: false, createdAt: "2025-11-03T10:30:00+05:30", lastLoginAt: "2026-08-12T18:15:00+05:30", updatedAt: "2026-08-10T12:40:00+05:30", permissions: { effective: ["request.read", "donor.read", "stock.read", "hospital.read"], denied: ["authorization.manage", "super_admin.assign"] }, activity: [["Signed in", "12 Aug 2026", "Fixture Admin session"]] },
        { id: "USR-2026-0229", authUserId: "fixture-auth-donor-1", fullName: "Riya Patel", mobile: "+91 98765 52001", email: "riya.fixture@example.test", role: "Donor", status: "Active", isCurrentActor: false, createdAt: "2026-08-12T10:20:00+05:30", lastLoginAt: "2026-08-12T11:05:00+05:30", updatedAt: "2026-08-13T08:25:00+05:30", permissions: { effective: ["profile.read.self", "profile.update.self"], denied: [] }, activity: [["Account created", "12 Aug 2026", "Fixture donor registration"]] },
        { id: "USR-2026-0228", authUserId: "fixture-auth-hospital-1", fullName: "City Care Coordinator", mobile: "+91 98800 61004", email: "coordinator.citycare@example.test", role: "Hospital", status: "Active", isCurrentActor: false, createdAt: "2026-07-18T14:10:00+05:30", lastLoginAt: "2026-08-13T08:46:00+05:30", updatedAt: "2026-08-13T08:46:00+05:30", permissions: { effective: ["request.read.own", "request.create.own"], denied: [] }, activity: [["Signed in", "13 Aug 2026", "Fixture hospital account"]] },
        { id: "USR-2026-0227", authUserId: "fixture-auth-bank-1", fullName: "Red Hope Operator", mobile: "+91 98800 61005", email: "operator.redhope@example.test", role: "Blood Bank", status: "Active", isCurrentActor: false, createdAt: "2026-06-22T09:30:00+05:30", lastLoginAt: "2026-08-13T09:10:00+05:30", updatedAt: "2026-08-13T09:18:00+05:30", permissions: { effective: ["stock.read.own", "request.read.assigned"], denied: [] }, activity: [["Stock fixture reviewed", "13 Aug 2026", "Fixture bank account"]] },
        { id: "USR-2026-0226", authUserId: "fixture-auth-donor-2", fullName: "Arjun Singh", mobile: "+91 98765 52002", email: "arjun.fixture@example.test", role: "Donor", status: "Inactive", isCurrentActor: false, createdAt: "2026-08-11T14:05:00+05:30", lastLoginAt: "2026-08-11T14:30:00+05:30", updatedAt: "2026-08-12T10:10:00+05:30", permissions: { effective: [], denied: ["session.create"] }, activity: [["Account deactivated", "12 Aug 2026", "Fixture user lifecycle"]] },
        { id: "USR-2026-0225", authUserId: "fixture-auth-hospital-2", fullName: "Green Valley Coordinator", mobile: "+91 98800 61007", email: "coordinator.greenvalley@example.test", role: "Hospital", status: "Pending", isCurrentActor: false, createdAt: "2026-08-05T12:20:00+05:30", lastLoginAt: null, updatedAt: "2026-08-11T11:15:00+05:30", permissions: { effective: [], denied: [] }, activity: [["Account review queued", "5 Aug 2026", "Fixture pending account"]] },
        { id: "USR-2026-0224", authUserId: "fixture-auth-bank-2", fullName: "Western Care Operator", mobile: "+91 98800 61008", email: "operator.western@example.test", role: "Blood Bank", status: "Pending", isCurrentActor: false, createdAt: "2026-08-08T10:10:00+05:30", lastLoginAt: null, updatedAt: "2026-08-12T10:05:00+05:30", permissions: { effective: [], denied: [] }, activity: [["Account review queued", "8 Aug 2026", "Fixture pending account"]] },
        { id: "USR-2026-0223", authUserId: "fixture-auth-donor-3", fullName: "Sana Khan", mobile: "+91 98765 52005", email: "sana.fixture@example.test", role: "Donor", status: "Suspended", isCurrentActor: false, createdAt: "2026-08-08T11:32:00+05:30", lastLoginAt: "2026-08-09T08:00:00+05:30", updatedAt: "2026-08-12T15:45:00+05:30", permissions: { effective: [], denied: ["session.create"] }, activity: [["Account suspended", "12 Aug 2026", "Fixture review outcome"]] },
        { id: "USR-2026-0222", authUserId: "fixture-auth-donor-4", fullName: "Kunal Verma", mobile: "+91 98765 52010", email: "kunal.fixture@example.test", role: "Donor", status: "Rejected", isCurrentActor: false, createdAt: "2026-08-03T10:05:00+05:30", lastLoginAt: null, updatedAt: "2026-08-03T14:30:00+05:30", permissions: { effective: [], denied: [] }, activity: [["Registration rejected", "3 Aug 2026", "Fixture details incomplete"]] }
    ];
    const dashboard = { summaries: [{ label: "Blood Requests", value: 24, note: "5 urgent" }, { label: "Donors", value: 186, note: "42 available" }, { label: "Blood Stock", value: 128, note: "total units" }, { label: "Blood Banks", value: 14, note: "12 verified" }, { label: "Hospitals", value: 27, note: "25 active" }, { label: "Users", value: 231, note: "fixture accounts" }], stock: [["A+", 32, "healthy"], ["A-", 14, "healthy"], ["B+", 28, "healthy"], ["B-", 9, "low"], ["AB+", 17, "healthy"], ["AB-", 7, "low"], ["O+", 16, "healthy"], ["O-", 5, "critical"]], activity: [["Urgent O+ request received", "12 min ago"], ["Donor verification pending", "28 min ago"], ["O- stock crossed critical threshold", "45 min ago"], ["Hospital account awaiting review", "2 hr ago"]] };
    const clone = value => JSON.parse(JSON.stringify(value));
    const priorityRank = { Urgent: 3, High: 2, Standard: 1 };
    async function getBloodRequests(filters = {}) {
        let items = clone(bloodRequests);
        const search = String(filters.search || "").trim().toLowerCase();
        if (search) items = items.filter(item => [item.id, item.patient, item.hospital, item.mobile, item.address].some(value => value.toLowerCase().includes(search)));
        if (filters.bloodGroup) items = items.filter(item => item.bloodGroup === filters.bloodGroup);
        if (filters.status) items = items.filter(item => item.status === filters.status);
        if (filters.dateRange) { const days = Number(filters.dateRange); const cutoff = new Date("2026-08-13T23:59:59+05:30"); cutoff.setDate(cutoff.getDate() - days); items = items.filter(item => new Date(item.createdAt) >= cutoff); }
        if (filters.sort === "oldest") items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        else if (filters.sort === "priority") items.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || new Date(b.createdAt) - new Date(a.createdAt));
        else items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const total = items.length;
        const pageSize = 5;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(Math.max(1, Number(filters.page) || 1), totalPages);
        return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages };
    }
    async function registerDonor(payload) {
        const mobile = String(payload.mobile || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
        const email = String(payload.email || "").trim().toLowerCase();
        const fullName = String(payload.fullName || "").trim();
        const validBloodGroups = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
        if (fullName.length < 2 || fullName.length > 100 || !/^[6-9]\d{9}$/.test(mobile) || !validBloodGroups.has(payload.bloodGroup) || payload.consent !== true) throw new Error("INVALID_FIXTURE_DONOR");
        if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("INVALID_FIXTURE_DONOR");
        if (donorRecords.some(donor => donor.mobile.replace(/\D/g, "").endsWith(mobile) || (email && donor.email.toLowerCase() === email))) throw new Error("DUPLICATE_FIXTURE_DONOR");
        return { accepted: true, fixtureId: `DN-LOCAL-${String(donorRecords.length + 1).padStart(4, "0")}` };
    }
    async function getDonors(filters = {}) {
        let items = clone(donorRecords);
        const search = String(filters.search || "").trim().toLowerCase();
        if (search) items = items.filter(item => [item.id, item.fullName, item.mobile, item.email, item.location].some(value => String(value).toLowerCase().includes(search)));
        if (filters.bloodGroup) items = items.filter(item => item.bloodGroup === filters.bloodGroup);
        if (filters.availability) items = items.filter(item => item.availability === filters.availability);
        if (filters.status) items = items.filter(item => item.status === filters.status);
        if (filters.sort === "oldest") items.sort((a, b) => new Date(a.registeredAt) - new Date(b.registeredAt));
        else if (filters.sort === "name") items.sort((a, b) => a.fullName.localeCompare(b.fullName));
        else if (filters.sort === "blood") items.sort((a, b) => a.bloodGroup.localeCompare(b.bloodGroup));
        else items.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
        const total = items.length;
        const pageSize = 5;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(Math.max(1, Number(filters.page) || 1), totalPages);
        return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages };
    }
    const getStockStatus = availableUnits => availableUnits <= stockStatusThresholds.criticalMaximum ? "Critical" : availableUnits <= stockStatusThresholds.lowMaximum ? "Low" : "Adequate";
    async function getBloodStock(filters = {}) {
        let items = clone(bloodStock).map(item => ({ ...item, status: getStockStatus(item.availableUnits), usableTotal: item.availableUnits + item.reservedUnits }));
        const allItems = clone(items);
        const search = String(filters.search || "").trim().toLowerCase();
        if (search) items = items.filter(item => [item.id, item.bloodGroup, item.bloodBank, item.location].some(value => value.toLowerCase().includes(search)));
        if (filters.bloodGroup) items = items.filter(item => item.bloodGroup === filters.bloodGroup);
        if (filters.status) items = items.filter(item => item.status === filters.status);
        if (filters.bloodBank) items = items.filter(item => item.bloodBank === filters.bloodBank);
        if (filters.sort === "blood") items.sort((a, b) => a.bloodGroup.localeCompare(b.bloodGroup) || a.bloodBank.localeCompare(b.bloodBank));
        else if (filters.sort === "units-high") items.sort((a, b) => b.availableUnits - a.availableUnits);
        else if (filters.sort === "units-low") items.sort((a, b) => a.availableUnits - b.availableUnits);
        else items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        return { items, total: items.length, summary: { availableUnits: allItems.reduce((sum, item) => sum + item.availableUnits, 0), lowGroups: allItems.filter(item => item.status === "Low").length, criticalGroups: allItems.filter(item => item.status === "Critical").length, bloodBanks: new Set(allItems.map(item => item.bloodBank)).size, recentlyUpdated: allItems.filter(item => new Date(item.updatedAt) >= new Date("2026-08-12T09:30:00+05:30")).length }, thresholds: clone(stockStatusThresholds), bloodBanks: [...new Set(allItems.map(item => item.bloodBank))].sort() };
    }
    const enrichBloodBank = bank => {
        const stock = bloodStock.filter(item => item.bloodBank === bank.name);
        const linkedRequests = bloodRequests.filter(item => item.assignment === bank.name);
        return { ...clone(bank), location: `${bank.city}, ${bank.state}`, stockSummary: { records: stock.length, availableUnits: stock.reduce((sum, item) => sum + item.availableUnits, 0), reservedUnits: stock.reduce((sum, item) => sum + item.reservedUnits, 0), bloodGroups: stock.map(item => item.bloodGroup).sort() }, requestSummary: { linked: linkedRequests.length, active: linkedRequests.filter(item => !["Fulfilled", "Rejected", "Cancelled"].includes(item.status)).length } };
    };
    async function getBloodBanks(filters = {}) {
        let items = bloodBanks.map(enrichBloodBank);
        const search = String(filters.search || "").trim().toLowerCase();
        if (search) items = items.filter(item => [item.id, item.name, item.contact, item.email, item.address, item.city, item.district, item.state].some(value => value.toLowerCase().includes(search)));
        if (filters.status) items = items.filter(item => item.status === filters.status);
        if (filters.location) items = items.filter(item => item.city === filters.location || item.district === filters.location);
        if (filters.sort === "oldest") items.sort((a, b) => new Date(a.registeredAt) - new Date(b.registeredAt));
        else if (filters.sort === "name") items.sort((a, b) => a.name.localeCompare(b.name));
        else if (filters.sort === "updated") items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        else items.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
        const total = items.length;
        const pageSize = 5;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(Math.max(1, Number(filters.page) || 1), totalPages);
        return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages, locations: [...new Set(bloodBanks.flatMap(item => [item.city, item.district]))].sort() };
    }
    const enrichHospital = hospital => {
        const requests = bloodRequests.filter(item => item.hospital === hospital.name).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const statuses = requests.reduce((summary, item) => ({ ...summary, [item.status]: (summary[item.status] || 0) + 1 }), {});
        return { ...clone(hospital), location: `${hospital.city}, ${hospital.state}`, requestSummary: { total: requests.length, active: requests.filter(item => !["Fulfilled", "Rejected", "Cancelled"].includes(item.status)).length, fulfilled: requests.filter(item => item.status === "Fulfilled").length, statuses, mostRecent: requests[0] ? { id: requests[0].id, status: requests[0].status, bloodGroup: requests[0].bloodGroup, createdAt: requests[0].createdAt } : null } };
    };
    async function getHospitals(filters = {}) {
        let items = hospitals.map(enrichHospital);
        const search = String(filters.search || "").trim().toLowerCase();
        if (search) items = items.filter(item => [item.id, item.name, item.contact, item.email, item.address, item.city, item.district, item.state].some(value => value.toLowerCase().includes(search)));
        if (filters.status) items = items.filter(item => item.status === filters.status);
        if (filters.location) items = items.filter(item => item.city === filters.location || item.district === filters.location);
        if (filters.sort === "oldest") items.sort((a, b) => new Date(a.registeredAt) - new Date(b.registeredAt));
        else if (filters.sort === "name") items.sort((a, b) => a.name.localeCompare(b.name));
        else if (filters.sort === "updated") items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        else items.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
        const total = items.length;
        const pageSize = 5;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(Math.max(1, Number(filters.page) || 1), totalPages);
        return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages, locations: [...new Set(hospitals.flatMap(item => [item.city, item.district]))].sort() };
    }
    async function getUsers(filters = {}) {
        let items = clone(users);
        const search = String(filters.search || "").trim().toLowerCase();
        if (search) items = items.filter(item => [item.id, item.authUserId, item.fullName, item.mobile, item.email, item.role, item.status].some(value => value.toLowerCase().includes(search)));
        if (filters.role) items = items.filter(item => item.role === filters.role);
        if (filters.status) items = items.filter(item => item.status === filters.status);
        if (filters.sort === "oldest") items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        else if (filters.sort === "name") items.sort((a, b) => a.fullName.localeCompare(b.fullName));
        else if (filters.sort === "login") items.sort((a, b) => (b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0) - (a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0));
        else if (filters.sort === "updated") items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        else items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const total = items.length;
        const pageSize = 5;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(Math.max(1, Number(filters.page) || 1), totalPages);
        return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages };
    }
    return {
        async getDashboard() { return clone(dashboard); },
        async getCollection(key) { if (!datasets[key]) throw new Error("Unknown fixture collection"); return clone(datasets[key]); },
        getBloodRequests,
        async getBloodRequestById(id) { const item = bloodRequests.find(request => request.id === id); return item ? clone(item) : null; },
        registerDonor,
        getDonors,
        async getDonorById(id) { const item = donorRecords.find(donor => donor.id === id); return item ? clone(item) : null; },
        getBloodStock,
        async getBloodStockById(id) { const item = bloodStock.find(stock => stock.id === id); return item ? { ...clone(item), status: getStockStatus(item.availableUnits), usableTotal: item.availableUnits + item.reservedUnits } : null; },
        getStockStatusThresholds() { return clone(stockStatusThresholds); },
        getBloodBanks,
        async getBloodBankById(id) { const item = bloodBanks.find(bank => bank.id === id); return item ? enrichBloodBank(item) : null; },
        getHospitals,
        async getHospitalById(id) { const item = hospitals.find(hospital => hospital.id === id); return item ? enrichHospital(item) : null; },
        getUsers,
        async getUserById(id) { const item = users.find(user => user.id === id); return item ? clone(item) : null; }
    };
})();
