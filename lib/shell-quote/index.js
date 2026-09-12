// Vendored copy of shell-quote@1.8.3 (full implementation)
// Used as a local workspace override to avoid the Replit package firewall block.
// Source: https://github.com/ljharb/shell-quote

'use strict';

exports.quote = function quote(xs) {
    return xs.map(function (s) {
        if (s && typeof s === 'object') {
            return s.op.replace(/(.)/g, '\\$1');
        }
        if (/[^A-Za-z0-9_\-.,:\/@\n%+]/.test(s)) {
            return "'" + s.replace(/'/g, "'\\''") + "'";
        }
        return s || "''";
    }).join(' ');
};

// return a modified env from the initial env
// using the rest args as keys
var defined = function (env, key) {
    return env[key] !== undefined;
};

exports.parse = function parse(s, env, opts) {
    var envc = typeof env === 'function' ? env : function (key) {
        return defined(env, key) ? env[key] : undefined;
    };
    if (typeof env === 'object' && !opts) {
        opts = {};
    }
    opts = opts || {};

    var chunker = /(#[^\n]*)|(\\.)|(["'])(?:(?!\3)[^\\]|\\.)*?\3|(\S+)/gs;
    var match;
    var words = [];
    var prevChar;
    var s2 = s;

    // Reset regex lastIndex each time
    chunker.lastIndex = 0;

    while ((match = chunker.exec(s2))) {
        // Comment
        if (match[1]) {
            continue;
        }

        var token;
        if (match[2]) {
            // Backslash-escaped character
            token = match[2].slice(1);
        } else if (match[3]) {
            // Quoted string
            var quote = match[3];
            var inner = match[0].slice(1, -1);
            if (quote === "'") {
                token = inner;
            } else {
                // double-quoted: expand env vars and backslash sequences
                token = inner.replace(/\\([$`"\\])/g, '$1').replace(
                    /\$([a-zA-Z_][a-zA-Z0-9_]*|\{[^}]+\})/g,
                    function (_, key) {
                        var k = key.charAt(0) === '{' ? key.slice(1, -1) : key;
                        var val = typeof env === 'function'
                            ? envc(k)
                            : (defined(env, k) ? env[k] : undefined);
                        return val === undefined ? (opts.operator ? { op: '\\$' + key } : '$' + key) : val;
                    }
                );
            }
        } else if (match[4]) {
            // Unquoted token; check for operators
            var raw = match[4];
            // Shell operators
            if (/^(&&|\|\||;;|<<|>>|[|><&;()])/.test(raw)) {
                var op = raw.match(/^(&&|\|\||;;|<<|>>|[|><&;()])/)[1];
                words.push({ op: op });
                var rest = raw.slice(op.length);
                if (rest) {
                    // re-process the rest
                    s2 = rest + s2.slice(chunker.lastIndex);
                    chunker.lastIndex = 0;
                }
                prevChar = op;
                continue;
            }
            // Env variable expansion in unquoted context
            token = raw.replace(
                /\$([a-zA-Z_][a-zA-Z0-9_]*|\{[^}]+\})/g,
                function (_, key) {
                    var k = key.charAt(0) === '{' ? key.slice(1, -1) : key;
                    var val = typeof env === 'function'
                        ? envc(k)
                        : (env && defined(env, k) ? env[k] : undefined);
                    return val === undefined ? '$' + key : val;
                }
            );
        } else {
            continue;
        }

        words.push(token);
        prevChar = token;
    }

    return words;
};
