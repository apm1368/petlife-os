#!/bin/bash
# Applies the opetlife.ir Postfix configuration (idempotent).
set -euo pipefail
C=/etc/letsencrypt/live/mail.opetlife.ir
postconf -e \
  "compatibility_level = 3.6" \
  "myhostname = mail.opetlife.ir" \
  "mydomain = opetlife.ir" \
  "myorigin = \$myhostname" \
  "mydestination = \$myhostname, localhost.\$mydomain, localhost, localhost.localdomain" \
  "mynetworks = 127.0.0.0/8 [::1]/128" \
  "inet_interfaces = all" \
  "inet_protocols = ipv4" \
  "smtpd_banner = \$myhostname ESMTP" \
  "biff = no" \
  "append_dot_mydomain = no" \
  "recipient_delimiter = +" \
  "message_size_limit = 26214400" \
  "mailbox_size_limit = 0" \
  "virtual_mailbox_domains = opetlife.ir" \
  "virtual_mailbox_maps = hash:/etc/postfix/vmailbox" \
  "virtual_alias_maps = hash:/etc/postfix/virtual" \
  "virtual_transport = lmtp:unix:private/dovecot-lmtp" \
  "smtpd_tls_chain_files = $C/privkey.pem, $C/fullchain.pem" \
  "smtpd_tls_cert_file =" "smtpd_tls_key_file =" \
  "smtpd_tls_security_level = may" \
  "smtpd_tls_auth_only = yes" \
  "smtpd_tls_protocols = !SSLv2, !SSLv3" \
  "smtpd_tls_mandatory_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1" \
  "smtpd_tls_loglevel = 1" \
  "smtpd_tls_received_header = yes" \
  "smtpd_tls_session_cache_database = btree:\${data_directory}/smtpd_scache" \
  "smtp_tls_security_level = may" \
  "smtp_tls_loglevel = 1" \
  "smtp_tls_CApath = /etc/ssl/certs" \
  "smtp_tls_protocols = !SSLv2, !SSLv3" \
  "smtp_tls_session_cache_database = btree:\${data_directory}/smtp_scache" \
  "smtp_address_preference = ipv4" \
  "smtpd_sasl_type = dovecot" \
  "smtpd_sasl_path = private/auth" \
  "smtpd_sasl_auth_enable = no" \
  "smtpd_sasl_security_options = noanonymous" \
  "smtpd_sasl_authenticated_header = no" \
  "smtpd_helo_required = yes" \
  "disable_vrfy_command = yes" \
  "strict_rfc821_envelopes = yes" \
  "smtpd_helo_restrictions = permit_mynetworks, reject_invalid_helo_hostname, reject_non_fqdn_helo_hostname" \
  "smtpd_sender_restrictions = permit_mynetworks, reject_non_fqdn_sender, reject_unknown_sender_domain, check_sender_access hash:/etc/postfix/own_domain_senders" \
  "smtpd_relay_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination" \
  "smtpd_recipient_restrictions = permit_mynetworks, reject_unauth_pipelining, reject_non_fqdn_recipient, reject_unknown_recipient_domain, reject_unlisted_recipient, check_policy_service unix:private/policyd-spf" \
  "smtpd_data_restrictions = reject_unauth_pipelining" \
  "policyd-spf_time_limit = 3600" \
  "smtpd_milters = inet:127.0.0.1:8891" \
  "non_smtpd_milters = inet:127.0.0.1:8891" \
  "milter_default_action = accept" \
  "milter_protocol = 6" \
  "smtpd_client_connection_rate_limit = 30" \
  "smtpd_client_message_rate_limit = 60" \
  "smtpd_client_auth_rate_limit = 12" \
  "anvil_rate_time_unit = 60s" \
  "smtpd_hard_error_limit = 10" \
  "smtpd_soft_error_limit = 5" \
  "postscreen_access_list = permit_mynetworks" \
  "postscreen_greet_action = enforce" \
  "postscreen_dnsbl_sites = zen.spamhaus.org=127.0.0.[2..11]*3, bl.spamcop.net*2, psbl.surriel.com*2, bl.mailspike.net=127.0.0.[10;11;12]*1" \
  "postscreen_dnsbl_threshold = 3" \
  "postscreen_dnsbl_action = enforce" \
  "default_destination_rate_delay = 0" \
  "maximal_queue_lifetime = 3d" \
  "bounce_queue_lifetime = 2d"

# Mail from the Internet (port 25) must not claim to be from our own domain; real users authenticate on 465/587.
printf 'opetlife.ir REJECT Use authenticated submission (port 465/587) to send as opetlife.ir\n' > /etc/postfix/own_domain_senders
postmap /etc/postfix/own_domain_senders
install -m 644 "$(dirname "$0")/submission_header_checks" /etc/postfix/submission_header_checks

# master.cf: postscreen on 25, submission (587, STARTTLS) and smtps (465, implicit TLS), SPF policy, header-stripping cleanup.
postconf -M "smtp/inet=smtp inet n - y - 1 postscreen"
postconf -M "smtpd/pass=smtpd pass - - y - - smtpd"
postconf -M "dnsblog/unix=dnsblog unix - - y - 0 dnsblog"
postconf -M "tlsproxy/unix=tlsproxy unix - - y - 0 tlsproxy"
postconf -M "subcleanup/unix=subcleanup unix n - y - 0 cleanup"
postconf -P "subcleanup/unix/header_checks=regexp:/etc/postfix/submission_header_checks"
postconf -M "policyd-spf/unix=policyd-spf unix - n n - 0 spawn user=policyd-spf argv=/usr/bin/policyd-spf"
for svc in submission smtps; do
  postconf -M "$svc/inet=$svc inet n - y - - smtpd"
  postconf -P "$svc/inet/syslog_name=postfix/$svc" \
              "$svc/inet/smtpd_sasl_auth_enable=yes" \
              "$svc/inet/smtpd_tls_auth_only=yes" \
              "$svc/inet/smtpd_reject_unlisted_recipient=no" \
              "$svc/inet/smtpd_client_restrictions=permit_sasl_authenticated,reject" \
              "$svc/inet/smtpd_helo_restrictions=" \
              "$svc/inet/smtpd_sender_login_maps=hash:/etc/postfix/sender_login" \
              "$svc/inet/smtpd_sender_restrictions=reject_sender_login_mismatch,permit_sasl_authenticated,reject" \
              "$svc/inet/smtpd_recipient_restrictions=" \
              "$svc/inet/smtpd_relay_restrictions=permit_sasl_authenticated,reject" \
              "$svc/inet/milter_macro_daemon_name=ORIGINATING" \
              "$svc/inet/cleanup_service_name=subcleanup"
done
postconf -P "submission/inet/smtpd_tls_security_level=encrypt"
postconf -P "smtps/inet/smtpd_tls_wrappermode=yes"
postconf -P "smtps/inet/smtpd_tls_security_level=encrypt"
for f in vmailbox virtual sender_login; do touch /etc/postfix/$f; postmap /etc/postfix/$f; done
postfix check
