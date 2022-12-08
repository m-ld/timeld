for proc in /proc/[0-9]*/cmdline; do
    echo $(cat $proc | tr "\0" " ");
done
